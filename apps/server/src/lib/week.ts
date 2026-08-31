import { db } from "@/server/db"
import {
  LessonType,
  type User,
  type Week,
} from "@/server/generated/prisma/client"
import log from "@/server/logger"
import type { Timetable } from "@ssau-schedule/shared/timetable"
import { lk } from "@/server/ssau/lk"
import { getCurrentYearId, getWeekFromDate } from "@ssau-schedule/shared/date"
import { getUserPreferences } from "@ssau-schedule/shared/utils"

export type WeekObject = Omit<Week, "timetable"> & {
  timetable: Timetable | null
}

export async function getWeek(
  user: User,
  weekN: number,
  opts?: {
    groupId?: number
    year?: number
    nonPersonal?: boolean
    update?: boolean
  },
): Promise<WeekObject> {
  const now = new Date()
  const owner =
    (opts?.nonPersonal // User asked for common week
      || (opts?.groupId && opts.groupId !== user.groupId) // User asked for a different group -> common week
    )
      // || !user.authCookie) // User is not authed -> common week // TODO: Figure out if unauthed users deserve custom lessons :]
      ? 0
      : user.id
  const groupId = opts?.groupId ?? user.groupId
  const year = (opts?.year ?? 0) || getCurrentYearId()
  const weekNumber = weekN || getWeekFromDate(now)

  if (!groupId) {
    log.error(`Groupless user getDbWeek`, { user: user.id })
    void lk.updateUserInfo(user)
    throw new Error(`Groupless user getDbWeek`)
  }

  const upd = opts?.update ? now : undefined

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
  })

  if (week.timetable) {
    const { timetable, ...data } = week
    const o = Object.assign(data, {
      timetable: timetable as object as Timetable,
    })
    return o
  }

  return Object.assign(week, { timetable: null })
}

export async function getWeekLessons(
  user: User,
  week: number,
  groupId?: number,
  opts?: {
    year?: number // TODO: Year support. Everywhere.
    ignoreIet?: boolean
    ignorePreferences?: boolean
    ignoreCustomizations?: boolean
  },
) {
  const preferences = getUserPreferences(user)
  if (!(groupId || user.groupId)) {
    log.error(`Groupless user requested an update`, { user: user.id })
    void lk.updateUserInfo(user)
    throw new Error(`Groupless user requested an update`)
  }

  const ignoreIet =
    (opts?.ignoreIet ?? false) ||
    (!opts?.ignorePreferences && !preferences.showIet) ||
    (groupId && groupId !== user.groupId)

  const militaryFilter =
    !opts?.ignorePreferences && !preferences.showMilitary
      ? { not: LessonType.Military }
      : undefined

  const now = new Date()
  const lessons = await db.lesson.findMany({
    where: {
      weekNumber: week,
      validUntil: { gt: now },
      groups: { some: { id: groupId ?? user.groupId! } },
      isIet: false,
      type: militaryFilter,
    },
    include: { groups: true, teacher: true },
  })

  const lessonIds = lessons.map((i) => i.id)

  const trustedLessonCustomizers = preferences.trustedLessonCustomizers ?? []

  const customLessons = opts?.ignoreCustomizations
    ? []
    : await db.customLesson.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                weekNumber: week,
              },
              {
                lessonId: { in: lessonIds },
              },
            ],
          },
          {
            OR: [
              // Owner always sees their own custom lessons
              { userId: user.id },
              // Viewer sees shared lessons if they match a target AND trust the owner
              {
                AND: [
                  {
                    OR: [
                      { targetUsers: { some: { id: user.id } } },
                      { targetGroups: { some: { id: user.groupId ?? -1 } } },
                      {
                        targetFlows: {
                          some: { user: { some: { id: user.id } } },
                        },
                      },
                    ],
                  },
                  { userId: { in: trustedLessonCustomizers } },
                ],
              },
            ],
          },
        ],
        // type: militaryFilter, // breaks on null
        isEnabled: true, // TODO: Allow viewing disabled customizations or figure out a better way
      },
      include: { groups: true, teacher: true, user: true, flows: true },
    })

  const customLessonTargetIds = customLessons
    .map((i) => i.lessonId)
    .filter((i) => i !== null)
  const replacedLessons = await db.lesson.findMany({
    where: {
      id: { in: customLessonTargetIds },
    },
    include: { groups: true, teacher: true },
  })
  lessons.push(...replacedLessons.filter((i) => !lessonIds.includes(i.id)))

  if (ignoreIet) return { lessons, ietLessons: [], customLessons, all: lessons }

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
  })
  return {
    customLessons,
    all: [...lessons, ...ietLessons],
  }
}

export async function getWeekTeacherLessons(teacherId: number, week: number) {
  const lessons = await db.lesson.findMany({
    where: {
      weekNumber: week,
      validUntil: { gt: new Date() },
      teacherId: teacherId,
    },
    include: { groups: true, teacher: true },
  })
  return lessons
}
