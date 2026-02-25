import { db } from "@/db";
import { LessonType, type User, type Week } from "@/generated/prisma/client";
import log from "@/logger";
import type { Timetable } from "@/schedule/types/timetable";
import { lk } from "@/ssau/lk";
import { getCurrentYearId, getWeekFromDate } from "@ssau-schedule/shared/date";
import { type UserPreferences, UserPreferencesDefaults } from "./misc";

export async function getWeek(
  user: User,
  weekN: number,
  opts?: {
    groupId?: number;
    year?: number;
    nonPersonal?: boolean;
    update?: boolean;
  },
): Promise<
  Omit<Week, "timetable"> & {
    timetable: Timetable | null;
  }
> {
  const now = new Date();
  const owner =
    opts?.nonPersonal || (opts?.groupId && opts.groupId !== user.groupId)
      ? 0
      : user.id;
  const groupId = opts?.groupId ?? user.groupId;
  const year = (opts?.year ?? 0) || getCurrentYearId();
  const weekNumber = weekN || getWeekFromDate(now);

  if (!groupId) {
    log.error(`Groupless user getDbWeek`, { user: user.id });
    void lk.updateUserInfo(user);
    throw new Error(`Groupless user getDbWeek`);
  }

  const upd = opts?.update ? now : undefined;

  const week = await db.week.upsert({
    where: {
      owner_groupId_year_number: {
        owner: owner,
        groupId: groupId,
        year: year,
        number: weekNumber,
      },
    },
    create: { owner, groupId, year, number: weekNumber, updatedAt: upd },
    update: upd ? { updatedAt: upd } : {},
  });

  if (week.timetable) {
    const { timetable, ...data } = week;
    const o = Object.assign(data, {
      timetable: timetable as object as Timetable,
    });
    return o;
  }

  return Object.assign(week, { timetable: null });
}

export async function getWeekLessons(
  user: User,
  week: number,
  groupId?: number,
  opts?: {
    ignoreIet?: boolean;
    ignorePreferences?: boolean;
    ignoreCustomizations?: boolean;
  },
) {
  const preferences: UserPreferences = Object.assign(
    {},
    UserPreferencesDefaults,
    user.preferences,
  );
  if (!(groupId || user.groupId)) {
    log.error(`Groupless user requested an update`, { user: user.id });
    void lk.updateUserInfo(user);
    throw new Error(`Groupless user requested an update`);
  }

  const ignoreIet =
    (opts?.ignoreIet ?? false) ||
    (!opts?.ignorePreferences && !preferences.showIet) ||
    (groupId && groupId !== user.groupId);

  const militaryFilter =
    !opts?.ignorePreferences && !preferences.showMilitary
      ? { not: LessonType.Military }
      : undefined;

  const now = new Date();
  const lessons = await db.lesson.findMany({
    where: {
      weekNumber: week,
      validUntil: { gt: now },
      groups: { some: { id: groupId ?? user.groupId! } },
      isIet: false,
      type: militaryFilter,
    },
    include: { groups: true, teacher: true },
  });

  const lessonIds = lessons.map((i) => i.id);

  const customLessons = opts?.ignoreCustomizations
    ? []
    : await db.customLesson.findMany({
        where: {
          OR: [
            {
              weekNumber: week,
            },
            {
              lessonId: { in: lessonIds },
            },
          ],
          userId: user.id,
          // type: militaryFilter, // breaks on null
          isEnabled: true, // TODO: Allow viewing disabled customizations or figure out a better way
        },
        include: { groups: true, teacher: true, user: true, flows: true },
      });

  const customLessonTargetIds = customLessons
    .map((i) => i.lessonId)
    .filter((i) => i !== null);
  const replacedLessons = await db.lesson.findMany({
    where: {
      id: { in: customLessonTargetIds },
    },
    include: { groups: true, teacher: true },
  });
  lessons.push(...replacedLessons.filter((i) => !lessonIds.includes(i.id)));

  if (ignoreIet)
    return { lessons, ietLessons: [], customLessons, all: lessons };

  // TODO: Add customLesson support to iets

  const ietLessons = await db.lesson.findMany({
    where: {
      weekNumber: week,
      validUntil: { gt: new Date() },
      flows: { some: { user: { some: { id: user.id } } } },
      isIet: true,
      type: militaryFilter,
    },
    include: { flows: true, teacher: true },
  });
  return {
    lessons,
    ietLessons,
    customLessons,
    all: [...lessons, ...ietLessons],
  };
}
