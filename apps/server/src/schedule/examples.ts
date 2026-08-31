import { getWeekFromDate } from "@ssau-schedule/shared/date";
import type { DrawableDay, DrawableLesson, DrawableTimetable } from "@ssau-schedule/shared/timetable";
import { getLessonTypeEnum } from "../ssau/types";
import { schedule } from "./requests";
import { LessonTypeName } from "@ssau-schedule/shared/misc";
import type { LessonType } from "../generated/prisma/enums";
import { db } from "../db";

function generateExampleLesson(type: LessonType, slot: number): DrawableLesson {
  const epoch = new Date(0)
  return {
    type,
    discipline: `${LessonTypeName[type]}`,
    teacher: {
      name: `Выдуманный А.Б.`,
    },
    isOnline: false,
    building: `1`,
    room: `101`,
    isIet: false,
    subgroup: null,
    groups: [],
    flows: [],
    beginTime: epoch,
    endTime: epoch,
    dayTimeSlot: slot,
  };
}

export function generateExampleTimetable(): DrawableTimetable {
  const now = new Date();
  const week = getWeekFromDate(now);
  const year = now.getFullYear();

  let lessonTypeCounter = 0;
  function getType() {
    return getLessonTypeEnum((Math.floor(lessonTypeCounter++ / 2) % 7) + 1); // Cycle through lesson types
  }
  const days = Array.from({ length: 6 }, (_, dayIndex) => {
    const lessons = Array.from({ length: 4 }, (_, lessonIndex) => {
      const beginTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + dayIndex,
        8 + lessonIndex * 2,
        0,
      );
      const endTime = new Date(beginTime);
      endTime.setHours(endTime.getHours() + 1);

      const type = getType();
      const subgrouped = Math.floor(lessonTypeCounter) % 6 === 0;
      const slot = lessonIndex + 1 + Number(lessonIndex + 1 > dayIndex % 3 * 2) * 2
      return {
        id: lessonIndex + 1,
        infoId: lessonIndex + 1,
        type,
        discipline: `${LessonTypeName[type]}`,
        teacher: {
          name: `Выдуманный А.Б.`,
        },
        isOnline: lessonTypeCounter % 5 === 0,
        building: `${lessonIndex + 1}`,
        room: `${lessonIndex + 100}`,
        isIet: lessonTypeCounter % 10 === 0,
        subgroup: subgrouped ? 1 : null,
        groups: [],
        flows: [],
        dayTimeSlot: slot,
        beginTime,
        endTime,
        alts: subgrouped ? [
          {
            ...generateExampleLesson(type, slot),
            subgroup: 2
          },
        ] : []
      } as DrawableLesson;
    });

    const beginTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + dayIndex,
      8,
      0,
    );
    const endTime = new Date(beginTime);
    endTime.setHours(endTime.getHours() + 10);

    return {
      week,
      weekday: dayIndex + 1,
      beginTime,
      endTime,
      lessons,
    } as DrawableDay;
  });

  return {
    week,
    year,
    days,
  };
}

export async function generateExampleTimetableImage(stylemap: string) {
  const timetable = generateExampleTimetable();
  const image = await schedule.generateTimetableImage(timetable, { stylemap, showTeacher: true, showGrouplist: false });
  return { timetable, image };
}

export async function getExampleTimetableImage(stylemap: string) {
  const existingImage = await db.weekImage.findUnique({
    where: {
      stylemap_timetableHash: {
        stylemap,
        timetableHash: "example",
      },
    },
  });

  if (existingImage) {
    return {
      timetable: generateExampleTimetable(),
      image: existingImage,
    };
  }

  const { timetable, image } = await generateExampleTimetableImage(stylemap);
  const imageObject = await db.weekImage.create({
    data: {
      stylemap,
      timetableHash: "example",
      data: image.toBase64(),
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // 1 year
    },
  });
  return { timetable, image: imageObject }
}