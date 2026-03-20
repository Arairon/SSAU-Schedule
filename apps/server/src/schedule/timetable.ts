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
  NormalizedTimetableLesson,
  Timetable,
  TimetableDay,
  TimetableDiff,
  TimetableLesson,
} from "@/schedule/types/timetable";
import { getWeek, getWeekLessons } from "@/lib/week";
import { applyCustomization } from "./customLesson";
import { lessonToTimetableLesson } from "@/lib/misc";

function compareLessonSubgroup(
  left: TimetableLesson,
  right: TimetableLesson,
): number {
  const leftSubgroup = left.subgroup ?? -1;
  const rightSubgroup = right.subgroup ?? -1;
  if (leftSubgroup !== rightSubgroup) return leftSubgroup - rightSubgroup;

  if (left.id !== right.id) return left.id - right.id;
  return left.discipline.localeCompare(right.discipline);
}

function addLessonToDay(day: TimetableDay, lesson: TimetableLesson): void {
  const sameSlotLessons = day.lessons.filter(
    (existing) => existing.dayTimeSlot === lesson.dayTimeSlot,
  );

  if (sameSlotLessons.length === 0) {
    day.lessonCount += 1;
    day.lessons.push(lesson);
    return;
  }

  const mergedLessons = [
    lesson,
    ...sameSlotLessons,
    ...sameSlotLessons.flatMap((existing) => existing.alts),
  ];
  mergedLessons.forEach((entry) => {
    entry.alts = [];
  });
  mergedLessons.sort(compareLessonSubgroup);

  const primaryLesson = mergedLessons[0];
  primaryLesson.alts = mergedLessons.slice(1);

  day.lessons = day.lessons.filter(
    (existing) => !sameSlotLessons.includes(existing),
  );
  day.lessons.push(primaryLesson);
}

export async function generateTimetable(
  user: User,
  weekN: number,
  opts?: {
    groupId?: number; // User requests a group's schedule instead of personal.
    year?: number;
    dontCache?: boolean;
    ignoreIet?: boolean;
    ignoreSubgroup?: boolean;
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
  const subgroup = isNonPersonal || opts?.ignoreSubgroup ? null : user.subgroup;

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
    const timetableLesson = lessonToTimetableLesson(lesson);

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

    addLessonToDay(day, timetableLesson);
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

      addLessonToDay(day, lesson);
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

export function flattenLesson(lesson: TimetableLesson): TimetableLesson[] {
  return [lesson, ...lesson.alts.flatMap(flattenLesson)];
}

export function flattenTimetable(timetable: Timetable): TimetableLesson[] {
  return timetable.days.flatMap((day) =>
    day.lessons.flatMap((lesson) => flattenLesson(lesson)),
  );
}

function normalizeTimetableLesson(
  lesson: TimetableLesson,
): NormalizedTimetableLesson {
  const normalizeStringArray = (values: string[]) => [...values].sort();

  return {
    id: lesson.id,
    infoId: lesson.infoId,
    type: lesson.type,
    discipline: lesson.discipline,
    teacher: {
      name: lesson.teacher.name,
      id: lesson.teacher.id,
    },
    isOnline: lesson.isOnline,
    isIet: lesson.isIet,
    building: lesson.building,
    room: lesson.room,
    subgroup: lesson.subgroup,
    groups: normalizeStringArray(lesson.groups),
    flows: normalizeStringArray(lesson.flows),
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
  };
}

export function getTimetableHash(timetable: Timetable) {
  const normalizedLessons = flattenTimetable(timetable).map(
    normalizeTimetableLesson,
  );
  const withSortKey = normalizedLessons.map((lesson) => {
    const sortTuple = [
      lesson.id,
      lesson.infoId,
      lesson.dayTimeSlot,
      lesson.beginTime,
      lesson.endTime,
      lesson.type,
      lesson.discipline,
      lesson.teacher.id ?? -1,
      lesson.teacher.name,
      lesson.isOnline ? 1 : 0,
      lesson.isIet ? 1 : 0,
      lesson.subgroup ?? -1,
      lesson.building ?? "",
      lesson.room ?? "",
      lesson.conferenceUrl ?? "",
    ] as const;
    return {
      lesson,
      sortTuple,
      jsonKey: JSON.stringify(lesson),
    };
  });

  withSortKey.sort((a, b) => {
    for (let i = 0; i < a.sortTuple.length; i++) {
      const left = a.sortTuple[i];
      const right = b.sortTuple[i];
      if (left === right) continue;
      if (typeof left === "number" && typeof right === "number") {
        return left - right;
      }
      const leftStr = String(left);
      const rightStr = String(right);
      if (leftStr < rightStr) return -1;
      if (leftStr > rightStr) return 1;
    }
    if (a.jsonKey < b.jsonKey) return -1;
    if (a.jsonKey > b.jsonKey) return 1;
    return 0;
  });

  return md5(JSON.stringify(withSortKey.map((entry) => entry.lesson)));
}

export function getTimetablesDiff(
  oldTimetable: Timetable,
  newTimetable: Timetable,
): TimetableDiff | null {
  const added: TimetableLesson[] = [];
  const removed: TimetableLesson[] = [];
  const modified: { old: Partial<TimetableLesson>; new: TimetableLesson }[] =
    [];

  const normalizeLesson = (lesson: TimetableLesson) => ({
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

  const getLessonKey = (lesson: TimetableLesson) =>
    JSON.stringify(normalizeLesson(lesson));

  const getModifiedKey = (lesson: TimetableLesson) =>
    JSON.stringify({
      // infoId: lesson.infoId,
      discipline: lesson.discipline,
      type: lesson.type,
      beginTime: new Date(lesson.beginTime).getTime(),
      endTime: new Date(lesson.endTime).getTime(),
    });

  const normalizedToLessonKey: Record<string, string> = {
    teacherName: "teacher",
    teacherId: "teacher",
    isOnline: "isOnline",
  };

  const getChangedOldFields = (
    oldLesson: TimetableLesson,
    newLesson: TimetableLesson,
  ): Partial<TimetableLesson> => {
    const oldNormalized = normalizeLesson(oldLesson);
    const newNormalized = normalizeLesson(newLesson);
    const oldChanged: Partial<TimetableLesson> = {};

    const oldLessonRecord = oldLesson as unknown as Record<string, unknown>;
    const oldChangedRecord = oldChanged as unknown as Record<string, unknown>;

    for (const [normalizedKey, oldValue] of Object.entries(oldNormalized) as [
      keyof typeof oldNormalized,
      unknown,
    ][]) {
      const newValue = newNormalized[normalizedKey];
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;

      const lessonKey = normalizedToLessonKey[normalizedKey] ?? normalizedKey;
      oldChangedRecord[lessonKey] = oldLessonRecord[lessonKey];
    }

    return oldChanged;
  };

  const oldByKey = new Map<string, TimetableLesson[]>();
  const newByKey = new Map<string, TimetableLesson[]>();

  for (const lesson of flattenTimetable(oldTimetable)) {
    const key = getLessonKey(lesson);
    const bucket = oldByKey.get(key);
    if (bucket) {
      bucket.push(lesson);
    } else {
      oldByKey.set(key, [lesson]);
    }
  }

  for (const lesson of flattenTimetable(newTimetable)) {
    const key = getLessonKey(lesson);
    const bucket = newByKey.get(key);
    if (bucket) {
      bucket.push(lesson);
    } else {
      newByKey.set(key, [lesson]);
    }
  }

  const keys = new Set([...oldByKey.keys(), ...newByKey.keys()]);
  const unmatchedRemoved: TimetableLesson[] = [];
  const unmatchedAdded: TimetableLesson[] = [];

  for (const key of keys) {
    const oldLessons = oldByKey.get(key) ?? [];
    const newLessons = newByKey.get(key) ?? [];
    const matchedCount = Math.min(oldLessons.length, newLessons.length);

    for (let i = 0; i < matchedCount; i++) {
      oldLessons.pop();
      newLessons.pop();
    }

    if (oldLessons.length > 0) {
      unmatchedRemoved.push(...oldLessons);
    }
    if (newLessons.length > 0) {
      unmatchedAdded.push(...newLessons);
    }
  }

  // Reclassify add/remove pairs as modified when they have the same
  // discipline, type and start/end time.
  const addedByModifiedKey = new Map<string, TimetableLesson[]>();
  for (const lesson of unmatchedAdded) {
    const key = getModifiedKey(lesson);
    const bucket = addedByModifiedKey.get(key);
    if (bucket) {
      bucket.push(lesson);
    } else {
      addedByModifiedKey.set(key, [lesson]);
    }
  }

  for (const oldLesson of unmatchedRemoved) {
    const key = getModifiedKey(oldLesson);
    const candidates = addedByModifiedKey.get(key);

    if (candidates && candidates.length > 0) {
      const newLesson = candidates.pop();
      if (newLesson) {
        modified.push({
          old: getChangedOldFields(oldLesson, newLesson),
          new: newLesson,
        });
      }
      if (candidates.length === 0) {
        addedByModifiedKey.delete(key);
      }
      continue;
    }

    removed.push(oldLesson);
  }

  for (const lessons of addedByModifiedKey.values()) {
    added.push(...lessons);
  }

  if (added.length === 0 && removed.length === 0 && modified.length === 0) {
    return null;
  }

  return {
    added,
    removed,
    modified,
  };
}
