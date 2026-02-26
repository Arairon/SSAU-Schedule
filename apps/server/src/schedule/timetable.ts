import type { User } from "@/generated/prisma/client";
import { LessonType } from "@/generated/prisma/client";
import { formatSentence, md5, formatBigInt } from "@ssau-schedule/shared/utils";
import {
  getLessonDate,
  getWeekFromDate,
  getCurrentYearId,
} from "@ssau-schedule/shared/date";
import { db } from "@/db";
import { lk } from "../ssau/lk";
import log from "@/logger";
import type {
  Timetable,
  TimetableDay,
  TimetableDiff,
  TimetableLesson,
} from "@/schedule/types/timetable";
import { getWeek, getWeekLessons } from "@/lib/week";
import { applyCustomization } from "./customLesson";

export async function generateTimetable(
  user: User,
  weekN: number,
  opts?: {
    groupId?: number; // User requests a group's schedule instead of personal.
    year?: number;
    dontCache?: boolean;
    ignoreIet?: boolean;
    ignoreSubroup?: boolean;
  },
): Promise<Timetable> {
  const startTime = process.hrtime.bigint();
  const now = new Date();
  const weekNumber = weekN || getWeekFromDate(now);
  const year = (opts?.year ?? 0) || getCurrentYearId();
  const groupId = opts?.groupId ?? user.groupId;

  if (!groupId) {
    log.error(`Groupless user @getWeekTimetable`, { user: user.id });
    void lk.updateUserInfo(user);
    throw new Error(`Groupless user @getWeekTimetable`);
  }

  const week = await getWeek(user, weekN, {
    year,
    groupId,
    nonPersonal: !!opts?.groupId,
  });
  const isNonPersonal = week.owner === 0; // NonPersonal -> ignore iets and subgroup options
  const subgroup = isNonPersonal || opts?.ignoreSubroup ? null : user.subgroup;

  log.debug(
    `Week #${week.id} (${week.owner}/${week.groupId}/${week.year}/${week.number}) Generating timetable`,
    {
      user: user.id,
    },
  );

  const lessons = await getWeekLessons(user, weekNumber, week.groupId, {
    ignoreIet: (opts?.ignoreIet ?? false) || isNonPersonal,
    ignorePreferences: isNonPersonal,
    ignoreCustomizations: isNonPersonal,
  });

  // Create base
  const timetable: Timetable = {
    weekId: week.id,
    // user: user.id,
    groupId: week.groupId,
    year: year,
    week: weekNumber,
    hash: "", // Will be set later, after generating the timetable
    //withIet: (opts?.ignoreIet ?? false) || weekIsCommon,
    //isCommon: weekIsCommon,
    days: [],
  };

  // Fill base with empty days
  for (let dayNumber = 1; dayNumber <= 6; dayNumber++) {
    // Sundays not supported. Hopefully won't have to add them later...
    const date = getLessonDate(weekNumber, dayNumber);
    const dayTimetable: TimetableDay = {
      // user: user.id,
      week: weekNumber,
      weekday: dayNumber,
      beginTime: new Date(date.getTime() + 86400_000), // max in day to then find min
      endTime: date, // same
      lessons: [],
      lessonCount: 0,
    };
    timetable.days.push(dayTimetable);
  }

  const customLessons = lessons.customLessons;

  // Run through all the lessons and add them to the timetable, applying customizations if needed
  for (const lesson of lessons.all) {
    const timetableLesson: TimetableLesson = {
      id: lesson.id,
      infoId: lesson.infoId,
      type: lesson.type,
      discipline: formatSentence(lesson.discipline),
      teacher: {
        name: lesson.teacher.name,
        id: lesson.teacherId,
      },
      isOnline: lesson.isOnline,
      isIet: lesson.isIet,
      building: lesson.building,
      room: lesson.room,
      subgroup: lesson.subgroup,
      groups: [],
      flows: [],
      dayTimeSlot: lesson.dayTimeSlot,
      beginTime: lesson.beginTime,
      endTime: lesson.endTime,
      conferenceUrl: lesson.conferenceUrl,
      alts: [],
      customized: null,
      original: null,
    };
    if ("groups" in lesson)
      timetableLesson.groups = lesson.groups.map((g) => g.name);
    if ("flows" in lesson)
      timetableLesson.flows = lesson.flows.map((f) => f.name);

    const customLesson = customLessons.find((i) => i.lessonId === lesson.id);
    if (customLesson && customLesson.weekNumber !== timetable.week) continue; // Lesson was moved to another week
    if (!customLesson && lesson.weekNumber !== timetable.week) continue; // Lesson is from another week and was not moved to current by CustomLesson
    if (customLesson) {
      applyCustomization(timetableLesson, customLesson);
    }

    const day = timetable.days[lesson.weekday - 1];
    if (
      subgroup &&
      timetableLesson.subgroup &&
      subgroup !== timetableLesson.subgroup
    )
      continue;

    day.beginTime =
      timetableLesson.beginTime < day.beginTime
        ? timetableLesson.beginTime
        : day.beginTime;
    day.endTime =
      timetableLesson.endTime > day.endTime
        ? timetableLesson.endTime
        : day.endTime;

    const alts = day.lessons.filter(
      (l) => l.dayTimeSlot === lesson.dayTimeSlot,
    );
    if (alts.length > 0) {
      alts.forEach((alt) => {
        timetableLesson.alts.push(alt, ...alt.alts);
        alt.alts = [];
      });
      day.lessons = day.lessons.filter((l) => !alts.includes(l));
    } else {
      day.lessonCount += 1;
    }
    day.lessons.push(timetableLesson);
  }

  // Run through all customLessons that don't have a lessonId and add them as new lessons to the timetable
  customLessons
    .filter((i) => i.lessonId === null)
    .forEach((i) => {
      const lesson: TimetableLesson = {
        id: i.id,
        infoId: -1,
        type: i.type ?? LessonType.Unknown,
        discipline: formatSentence(i.discipline ?? "Неизвестный предмет"),
        teacher: {
          name: i.teacher?.name ?? "Неизвестный Преподаватель",
          id: i.teacherId,
        },
        isOnline: i.isOnline ?? false,
        isIet: i.isIet ?? false,
        building: i.building ?? "?",
        room: i.room ?? "???",
        subgroup: i.subgroup,
        groups: i.groups.map((g) => g.name),
        flows: i.flows.map((g) => g.name),
        dayTimeSlot: i.dayTimeSlot,
        beginTime: i.beginTime,
        endTime: i.endTime,
        conferenceUrl: i.conferenceUrl,
        alts: [],
        customized: {
          hidden: i.hideLesson,
          disabled: !i.isEnabled,
          comment: i.comment,
          customizedBy: i.userId,
        },
        original: null,
      };

      const day = timetable.days[i.weekday - 1];
      if (subgroup && lesson.subgroup && subgroup !== lesson.subgroup) return;
      day.beginTime =
        lesson.beginTime < day.beginTime ? lesson.beginTime : day.beginTime;
      day.endTime = lesson.endTime > day.endTime ? lesson.endTime : day.endTime;

      const alts = day.lessons.filter(
        (l) => l.dayTimeSlot === lesson.dayTimeSlot,
      );
      if (alts.length > 0) {
        alts.forEach((alt) => {
          lesson.alts.push(alt, ...alt.alts);
          alt.alts = [];
        });
        day.lessons = day.lessons.filter((l) => !alts.includes(l));
      } else {
        day.lessonCount += 1;
      }
      day.lessons.push(lesson);
    });

  // Sort lessons in each day by time
  for (const day of timetable.days) {
    day.lessons.sort((a, b) => a.dayTimeSlot - b.dayTimeSlot);
    if (day.lessonCount === 0) {
      const t = day.beginTime;
      day.beginTime = day.endTime;
      day.endTime = t;
    }
  }

  timetable.hash = getTimetableHash(timetable);

  if (!opts?.dontCache) {
    await db.week.update({
      where: { id: week.id },
      data: {
        timetable,
        timetableHash: timetable.hash,
        cachedUntil: new Date(Date.now() + 3600_000), // 1 hour
        // No longer invalidating images if they've been generated using the same timetable. Checked by hash. Instead update them
        // images: {
        //   updateMany: {
        //     where: { timetableHash: { not: timetableHash } },
        //     data: { validUntil: now },
        //   },
        // },
      },
    });
    await db.weekImage.updateMany({
      where: { timetableHash: timetable.hash },
      data: { validUntil: new Date(Date.now() + 4 * 604800_000) }, // 4 weeks
    });
  }
  log.debug(
    `Generated timetable for week #${week.id} in ${formatBigInt(
      process.hrtime.bigint() - startTime,
    )}ns`,
    { user: user.id },
  );
  return timetable;
}

export function getTimetableHash(timetable: Timetable) {
  return md5(
    JSON.stringify(timetable.days.map((d) => d.lessons.filter((l) => l))),
  );
}

export function flattenLesson(lesson: TimetableLesson): TimetableLesson[] {
  return [lesson, ...lesson.alts.flatMap(flattenLesson)];
}

export function flattenTimetable(timetable: Timetable): TimetableLesson[] {
  return timetable.days.flatMap((day) =>
    day.lessons.flatMap((lesson) => flattenLesson(lesson)),
  );
}

export function getTimetablesDiff(
  oldTimetable: Timetable,
  newTimetable: Timetable,
): TimetableDiff {
  const added: TimetableLesson[] = [];
  const removed: TimetableLesson[] = [];

  const getLessonKey = (lesson: TimetableLesson) =>
    JSON.stringify({
      id: lesson.id,
      infoId: lesson.infoId,
      type: lesson.type,
      discipline: lesson.discipline,
      teacherName: lesson.teacher.name,
      teacherId: lesson.teacher.id,
      isOnline: lesson.isOnline,
      isIet: lesson.isIet,
      building: lesson.building,
      room: lesson.room,
      subgroup: lesson.subgroup,
      groups: [...lesson.groups].sort(),
      flows: [...lesson.flows].sort(),
      dayTimeSlot: lesson.dayTimeSlot,
      beginTime: new Date(lesson.beginTime).getTime(),
      endTime: new Date(lesson.endTime).getTime(),
      conferenceUrl: lesson.conferenceUrl,
      customized: lesson.customized
        ? {
            hidden: lesson.customized.hidden,
            disabled: lesson.customized.disabled,
            comment: lesson.customized.comment,
            customizedBy: lesson.customized.customizedBy,
          }
        : null,
    });

  const oldByKey = new Map<string, TimetableLesson>();
  const newByKey = new Map<string, TimetableLesson>();

  for (const lesson of flattenTimetable(oldTimetable)) {
    const key = getLessonKey(lesson);
    oldByKey.set(key, lesson);
  }

  for (const lesson of flattenTimetable(newTimetable)) {
    const key = getLessonKey(lesson);
    newByKey.set(key, lesson);
  }

  const keys = new Set([...oldByKey.keys(), ...newByKey.keys()]);
  for (const key of keys) {
    const oldLesson = oldByKey.get(key);
    const newLesson = newByKey.get(key);

    if (!oldLesson && newLesson) {
      added.push(newLesson);
    }
    if (oldLesson && !newLesson) {
      removed.push(oldLesson);
    }
  }

  return {
    added,
    removed,
  };
}
