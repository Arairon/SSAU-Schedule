import type { DrawableTimetable, LessonType } from "@ssau-schedule/shared/timetable";
import { getLessonTypeFromName } from "@ssau-schedule/shared/misc";
import log from "@/server/logger";
import axios from "axios";
import * as cheerio from "cheerio";
import { ok, err } from "neverthrow";
import { getCurrentYearId, getLessonDate } from "@ssau-schedule/shared/date";
import { TimeSlotMap } from "@ssau-schedule/shared/timeSlotMap";

type RaspLesson = {
  discipline: string;
  building: string | null;
  room: string | null;
  isOnline: boolean;
  type: LessonType;
  dayTimeSlot: number;
  beginTime: Date;
  endTime: Date;
  teacher: {
    name: string;
    id: number;
    state?: string;
  } | null;
  groups: {
    id: number;
    name: string;
    subgroup: number | null;
  }[];
  flows: [];
  isIet: false;
  subgroup: number | null;
};

type RaspScheduleDay = {
  week: number;
  weekday: number;
  beginTime: Date;
  endTime: Date;
  lessons: RaspLesson[];
}

export type RaspSchedule = {
  week: number;
  year: number;
  days: RaspScheduleDay[];
  groups: Record<number, string>
};

export function convertRaspScheduleToDrawable(schedule: RaspSchedule): DrawableTimetable {
  const drawableSchedule: DrawableTimetable = {
    week: schedule.week,
    year: schedule.year,
    days: schedule.days.map((day) => ({
      week: day.week,
      weekday: day.weekday,
      beginTime: day.beginTime,
      endTime: day.endTime,
      lessons: day.lessons.map((lesson) => ({
        dayTimeSlot: lesson.dayTimeSlot,
        beginTime: lesson.beginTime,
        endTime: lesson.endTime,
        type: lesson.type,
        discipline: lesson.discipline,
        teacher: lesson.teacher ? { name: lesson.teacher.name } : null,
        isOnline: lesson.isOnline,
        building: lesson.building,
        room: lesson.room,
        isIet: false,
        subgroup: lesson.subgroup,
        groups: lesson.groups.map((g) => g.name),
        flows: [],
      })),
    })),
  };
  return drawableSchedule;
}

function parseSsauRaspTimetableCard(page: string) {
  const $ = cheerio.load(page);
  const card = $(".card-default.timetable-card");
  const weekNumberRaw = card
    .find(".week-nav-current_week")
    .text()
    .trim()
    .split(" ")[0];
  const table = card.find("div.schedule__items");
  if (!table) {
    return err(
      new Error(
        "Failed to parse SSAU RASP page: div.schedule__items not found",
      ),
    );
  }
  if (isNaN(parseInt(weekNumberRaw))) {
    return err(
      new Error(
        `Failed to parse SSAU RASP page: week number not found or invalid: ${weekNumberRaw}`,
      ),
    );
  }

  const schedule: RaspSchedule = {
    week: parseInt(weekNumberRaw),
    year: getCurrentYearId(),
    days: [],
    groups: {}
  };
  const items = table.children(".schedule__item").slice(7); // slice table headers
  const tableHeight = table.children(".schedule__time").length;
  for (let dayIndex = 0; dayIndex < 6; dayIndex++) {
    const day: RaspScheduleDay = {
      week: schedule.week,
      weekday: dayIndex + 1,
      beginTime: getLessonDate(schedule.week, dayIndex + 2), // set to tomorrow as a maximum
      endTime: getLessonDate(schedule.week, dayIndex + 1), // set to today as a minimum
      lessons: [],
    }
    schedule.days.push(day);
    for (let timeSlotIndex = 0; timeSlotIndex < tableHeight; timeSlotIndex++) {
      const lessonElement = items.eq(timeSlotIndex * 6 + dayIndex);
      if (lessonElement.children().length === 0) {
        continue;
      }
      const lessonTypeRaw = lessonElement
        .find(".schedule__lesson-type-chip")
        .text()
        .trim();

      const lessonTime = getLessonDate(schedule.week, dayIndex + 1).getTime();
      const timeslot = TimeSlotMap[timeSlotIndex + 1];

      const lesson: RaspLesson = {
        discipline: lessonElement.find(".schedule__discipline").text().trim(),
        dayTimeSlot: timeSlotIndex + 1,
        type: getLessonTypeFromName(lessonTypeRaw),
        building: null,
        room: null,
        isOnline: true,
        beginTime: new Date(lessonTime + timeslot.beginDelta),
        endTime: new Date(lessonTime + timeslot.endDelta),
        teacher: null,
        groups: [],
        subgroup: null,
        flows: [],
        isIet: false,
      };

      if (day.beginTime > lesson.beginTime) {
        day.beginTime = new Date(lesson.beginTime);
      }
      if (day.endTime < lesson.endTime) {
        day.endTime = new Date(lesson.endTime);
      }

      lessonElement.find(".schedule__group").each((_, el) => {
        const groupId = /groupId=(\d+)/.exec($(el).attr("href") ?? "")?.[1];
        const groupNameRaw = $(el).text().trim();
        const [groupName, subgroupRaw] = groupNameRaw.split(" (");
        const subgroup = subgroupRaw
          ? parseInt(subgroupRaw.replace(")", ""))
          : null;
        if (groupId && groupName) {
          const id = parseInt(groupId);
          lesson.groups.push({
            id: id,
            name: groupName,
            subgroup: subgroup,
          });
          schedule.groups[id] = groupName;
          if (lesson.subgroup && subgroup && lesson.subgroup !== subgroup) {
            lesson.subgroup = -1;
          }
          lesson.subgroup ??= subgroup;
        }
      });

      if (lesson.subgroup === -1) {
        lesson.subgroup = null;
      }

      const locationRaw = lessonElement.find(".schedule__place").text().trim();
      if (locationRaw.toLowerCase() !== "online") {
        const [building, room] = locationRaw.split("-").map((s) => s.trim());
        lesson.building = building;
        lesson.room = room;
        lesson.isOnline = false;
      }

      day.lessons.push(lesson);
    }
    if (day.beginTime.getTime() > day.endTime.getTime()) {
      day.beginTime = getLessonDate(schedule.week, dayIndex + 1);
      day.endTime = day.beginTime;
    }
  }
  return ok(schedule);
}

export async function getTeacherWeekFromSsauRasp({
  staffId,
  selectedWeek,
}: {
  staffId: number;
  selectedWeek: number;
}) {
  log.debug(
    `Fetching schedule for teacher ${staffId} for week ${selectedWeek} from ssau.ru/rasp`,
    { tag: "rasp" },
  );
  const startTime = Date.now();
  const req = await axios.get<string>(`https://ssau.ru/rasp`, {
    params: { staffId, selectedWeek },
    validateStatus: () => true,
  });
  if (req.status !== 200) {
    return err(new Error(`Failed to fetch data from SSAU RASP: ${req.status}`));
  }
  const page = req.data;
  const $ = cheerio.load(page);
  const schedule = parseSsauRaspTimetableCard(page);
  if (schedule.isErr()) {
    return err(schedule.error);
  }
  const teacher = {
    id: staffId,
    name: $(".info-block__title").text().trim(),
    state: $(".info-block__description").text().trim(),
  };
  schedule.value.days.map((day) => {
    day.lessons.map((lesson) => {
      lesson.teacher = teacher;
    });
  });
  const endTime = Date.now();
  log.debug(
    `Fetched schedule for teacher ${staffId} for week ${selectedWeek} from ssau.ru/rasp in ${endTime - startTime}ms`,
    { tag: "rasp" },
  );
  return schedule;
}

export async function getGroupWeekFromSsauRasp({ }) {
  return new Error("Not implemented");
}
