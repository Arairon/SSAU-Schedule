import type { Lesson, $Enums, User, Week, WeekImage } from "@prisma/client";
import { LessonType } from "@prisma/client";
import axios from "axios";
import {
  formatSentence,
  getLessonDate,
  getWeekFromDate,
  getCurrentYearId,
} from "./utils";
import { db } from "../db";
import { lk } from "./lk";
import log from "../logger";
import { WeekResponseSchema } from "./scheduleSchemas";
import {
  ensureFlowExists,
  ensureGroupExists,
  ensureTeacherExists,
  type UserPreferences,
  UserPreferencesDefaults,
} from "./misc";
import { generateTimetableImage } from "./scheduleImage";

async function getWeekLessons(
  user: User,
  week: number,
  groupId?: number,
  opts?: { ignoreIet?: boolean; ignorePreferences?: boolean },
) {
  const preferences: UserPreferences = Object.assign(
    {},
    UserPreferencesDefaults,
    user.preferences,
  );
  if (!(groupId || user.groupId)) {
    log.error(`Groupless user requested an update`, { user: user.id });
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

  const lessons = await db.lesson.findMany({
    where: {
      weekNumber: week,
      validUntil: { gt: new Date() },
      groups: { some: { id: groupId ?? user.groupId! } },
      isIet: false,
      type: militaryFilter,
    },
    include: { groups: true, teacher: true },
  });

  if (ignoreIet) return { lessons, ietLessons: [], all: lessons };

  const ietLessons = await db.lesson.findMany({
    where: {
      weekNumber: week,
      validUntil: { gt: new Date() },
      flows: { some: { user: { some: { id: user.id } } } },
      isIet: true,
    },
    include: { flows: true, teacher: true },
  });
  return { lessons, ietLessons, all: [...lessons, ...ietLessons] };
}

export type TimetableLesson = {
  id: number;
  type: $Enums.LessonType;
  discipline: string;
  teacher: string;
  isOnline: boolean;
  building: string | null;
  room: string | null;
  isIet: boolean;
  subgroup: number | null;
  groups: string[];
  flows: string[];
  dayTimeSlot: number;
  beginTime: Date;
  endTime: Date;
  conferenceUrl: string | null;
  alts: TimetableLesson[];
};

export type WeekTimetableDay = {
  user: number;
  week: number;
  weekday: number;
  beginTime: Date;
  endTime: Date;
  lessons: TimetableLesson[];
  lessonCount: number;
};

export type WeekTimetable = {
  weekId: number;
  user: number;
  groupId: number;
  year: number;
  week: number;
  withIet: boolean;
  isCommon: boolean;
  days: WeekTimetableDay[];
};

async function getTimetableWithImage(
  user: User,
  weekN: number,
  opts?: {
    groupId?: number;
    year?: number;
    ignoreCached?: boolean;
    //dontCache?: boolean;
    forceUpdate?: boolean;
    ignoreIet?: boolean;
    stylemap?: string;
  },
) {
  const now = new Date();
  const year = (opts?.year ?? 0) || getCurrentYearId();
  const groupId = opts?.groupId ?? user.groupId;
  const stylemap = opts?.stylemap ?? "default";
  if (opts?.forceUpdate) opts.ignoreCached = true;

  if (!groupId) {
    log.error(`Groupless user @getWeekTimetable`, { user: user.id });
    throw new Error(`Groupless user @getWeekTimetable`);
  }

  const week = await getDbWeek(user, weekN, {
    year,
    groupId,
    images: { stylemap },
  });
  //const weekIsCommon = week.owner === 0; // NonPersonal -> ignore iets

  if (!opts?.ignoreCached && week.timetable && week.cachedUntil > now) {
    if (week.images.length > 0) {
      log.debug("Timetable Image good enough. Returning cached", {
        user: user.id,
      });
      const { data: imageData, ...otherData } = week.images[0];
      return {
        data: week.timetable,
        image: { ...otherData, data: Buffer.from(imageData, "base64") },
      };
    } else {
      log.debug("Timetable good enough, but no valid image was found", {
        user: user.id,
      });
    }
  }

  const usingCachedTimetable =
    !opts?.ignoreCached && week.timetable && week.cachedUntil > now;
  const timetable = usingCachedTimetable
    ? week.timetable!
    : await getWeekTimetable(user, week.number, {
        groupId: week.groupId,
        year: week.year,
        ignoreCached: opts?.ignoreCached,
        forceUpdate: opts?.forceUpdate,
        ignoreIet: opts?.ignoreIet,
      });

  const image = await generateTimetableImage(timetable, { stylemap });

  //if (!opts?.dontCache) {}
  const createdImage = await db.weekImage.create({
    data: {
      weekId: week.id,
      stylemap: stylemap,
      data: image.toString("base64"),
      validUntil: new Date(Date.now() + 604800_000), // 1 week
    },
  });

  return {
    data: timetable,
    image: Object.assign(createdImage, { data: image }),
  };
}

async function getWeekTimetable(
  user: User,
  weekN: number,
  opts?: {
    groupId?: number;
    year?: number;
    ignoreCached?: boolean;
    dontCache?: boolean;
    forceUpdate?: boolean;
    ignoreIet?: boolean;
  },
) {
  const now = new Date();
  const weekNumber = weekN || getWeekFromDate(now);
  const year = (opts?.year ?? 0) || getCurrentYearId();
  const groupId = opts?.groupId ?? user.groupId;
  const subgroup = groupId === user.groupId ? user.subgroup : null;
  if (opts?.forceUpdate) opts.ignoreCached = true;

  if (!groupId) {
    log.error(`Groupless user @getWeekTimetable`, { user: user.id });
    throw new Error(`Groupless user @getWeekTimetable`);
  }

  const week = await getDbWeek(user, weekN, { year, groupId });
  const weekIsCommon = week.owner === 0; // NonPersonal -> ignore iets

  if (!opts?.ignoreCached) {
    if (week.timetable && week.cachedUntil > now) {
      log.debug("Timetable good enough. Returning cached", { user: user.id });
      return week.timetable;
    }
  }

  if (opts?.forceUpdate) {
    log.debug("Requested forceUpdate. Updating week", { user: user.id });
    await updateWeekForUser(user, weekNumber, { year, groupId });
  } else if (Date.now() - week.updatedAt.getTime() > 86400_000) {
    // 1 day
    log.debug("Week updatedAt too old. Updating week", { user: user.id });
    await updateWeekForUser(user, weekNumber, { year, groupId });
  } else {
    log.debug("Week Timetable updatedAt look good. Not updating from ssau", {
      user: user.id,
    });
  }

  log.debug(
    `${week.id} (${week.owner}/${week.groupId}/${week.year}/${week.number}) Generating timetable`,
    {
      user: user.id,
    },
  );

  const lessons = await getWeekLessons(user, weekNumber, week.groupId, {
    ignoreIet: (opts?.ignoreIet ?? false) || weekIsCommon,
    ignorePreferences: weekIsCommon,
  });

  const timetable: WeekTimetable = {
    weekId: week.id,
    user: user.id,
    groupId: week.groupId,
    year: year,
    week: weekNumber,
    withIet: (opts?.ignoreIet ?? false) || weekIsCommon,
    isCommon: weekIsCommon,
    days: [],
  };
  for (let dayNumber = 1; dayNumber <= 6; dayNumber++) {
    // Sundays not supported. Hopefully won't have to add them later...
    const date = getLessonDate(weekNumber, dayNumber);
    const dayTimetable: WeekTimetableDay = {
      user: user.id,
      week: weekNumber,
      weekday: dayNumber,
      beginTime: new Date(date.getTime() + 86400_000), // max in day to then find min
      endTime: date, // same
      lessons: [],
      lessonCount: 0,
    };
    timetable.days.push(dayTimetable);
  }
  for (const lesson of lessons.all) {
    const day = timetable.days[lesson.weekday - 1];
    if (subgroup && lesson.subgroup && subgroup !== lesson.subgroup) continue;
    day.beginTime =
      lesson.beginTime < day.beginTime ? lesson.beginTime : day.beginTime;
    day.endTime = lesson.endTime > day.endTime ? lesson.endTime : day.endTime;
    const ttLesson: TimetableLesson = {
      id: lesson.id,
      type: lesson.type,
      discipline: formatSentence(lesson.discipline),
      teacher: lesson.teacher.name,
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
    };
    if ("groups" in lesson) ttLesson.groups = lesson.groups.map((g) => g.name);
    if ("flows" in lesson) ttLesson.flows = lesson.flows.map((f) => f.name);

    const alts = day.lessons.filter(
      (l) => l.dayTimeSlot === lesson.dayTimeSlot,
    );
    if (alts.length > 0) {
      alts.forEach((alt) => {
        ttLesson.alts.push(alt);
      });
      day.lessons = day.lessons.filter((l) => !alts.includes(l));
    } else {
      day.lessonCount += 1;
    }
    day.lessons.push(ttLesson);
  }
  for (const day of timetable.days) {
    day.lessons.sort((a, b) => a.dayTimeSlot - b.dayTimeSlot);
  }

  if (!opts?.dontCache) {
    //const updatedWeek =
    await db.week.update({
      where: { id: week.id },
      data: {
        timetable: timetable,
        cachedUntil: new Date(Date.now() + 604800_000), // 1 week
        images: {
          updateMany: { where: {}, data: { validUntil: now } },
        },
      },
    });
  }
  return timetable;
}

const LessonTypeMap = [
  LessonType.Unknown,
  LessonType.Lection,
  LessonType.Lab,
  LessonType.Practice,
  LessonType.Other,
  LessonType.Exam,
  LessonType.Consult,
];
function getLessonTypeEnum(type: number) {
  if (type < 0 || type >= LessonTypeMap.length) {
    log.error(`Found an unexpected typeId: ${type}`);
    type = 0;
  }
  return LessonTypeMap[type] as LessonType;
}

export const TimeSlotMap = [
  {
    name: "00:00-00:00",
    beginTime: "00:00",
    endTime: "00:00",
    beginDelta: 0,
    endDelta: 0,
  },
  {
    name: "08:00-09:35",
    beginTime: "08:00",
    endTime: "09:35",
    beginDelta: 28800_000,
    endDelta: 34500_000,
  },
  {
    name: "09:45-11:20",
    beginTime: "09:45",
    endTime: "11:20",
    beginDelta: 35100_000,
    endDelta: 40800_000,
  },
  {
    name: "11:30-13:05",
    beginTime: "11:30",
    endTime: "13:05",
    beginDelta: 41400_000,
    endDelta: 47100_000,
  },
  {
    name: "13:30-15:05",
    beginTime: "13:30",
    endTime: "15:05",
    beginDelta: 48600_000,
    endDelta: 54300_000,
  },
  {
    name: "15:15-16:50",
    beginTime: "15:15",
    endTime: "16:50",
    beginDelta: 54900_000,
    endDelta: 60600_000,
  },
  {
    name: "17:00-18:35",
    beginTime: "17:00",
    endTime: "18:35",
    beginDelta: 61200_000,
    endDelta: 66900_000,
  },
  {
    name: "18:45-20:15",
    beginTime: "18:45",
    endTime: "20:15",
    beginDelta: 67500_000,
    endDelta: 72900_000,
  },
  {
    name: "20:25-21:55",
    beginTime: "20:25",
    endTime: "21:55",
    beginDelta: 73500_000,
    endDelta: 78900_000,
  },
];

async function getDbWeek(
  user: User,
  weekN: number,
  opts?: {
    groupId?: number;
    year?: number;
    nonPersonal?: boolean;
    update?: boolean;
    images?:
      | {
          stylemap?: string;
        }
      | boolean;
  },
): Promise<
  Omit<Week, "timetable"> & { images: WeekImage[] } & {
    timetable: WeekTimetable | null;
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
    throw new Error(`Groupless user getDbWeek`);
  }

  const upd = opts?.update ? now : undefined;
  if (opts?.images && opts.images === true) opts.images = {};
  const includeImgs = opts?.images
    ? { where: Object.assign({}, opts.images, { validUntil: { gt: now } }) }
    : false;

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
    include: { images: includeImgs },
  });

  if (week.timetable) {
    const { timetable, ...data } = week;
    const o = Object.assign(data, {
      timetable: timetable as object as WeekTimetable,
    });
    return o;
  }

  return Object.assign(week, { timetable: null });
}

async function updateWeekForUser(
  user: User,
  weekN: number,
  opts?: { groupId?: number; year?: number },
) {
  if (!(await lk.ensureAuth(user))) throw new Error("Auth error");
  const now = new Date();
  const weekNumber = weekN || getWeekFromDate(now);
  const year = (opts?.year ?? 0) || getCurrentYearId();
  const someoneElsesGroup = opts?.groupId && opts.groupId !== user.groupId;
  const groupId =
    (someoneElsesGroup ? opts.groupId : user.groupId) ?? undefined;

  const week = await getDbWeek(user, weekNumber, { groupId, year });
  const weekIsCommon = week.owner === 0;

  log.info(
    `[SSAU] Updating week #${week.id} (${week.owner}/${week.groupId}/${week.year}/${week.number})`,
    { user: user.id },
  );

  const res = await axios.get(
    "https://lk.ssau.ru/api/proxy/timetable/get-timetable",
    {
      headers: {
        Cookie: user.authCookie,
      },
      params: {
        yearId: week.year,
        week: week.number,
        groupId: week.groupId,
        userType: "student",
      },
    },
  );
  const {
    //success,
    error,
    data: weekSched,
  } = WeekResponseSchema.safeParse(res.data);
  if (error) {
    log.error(
      `Error receiving schedule. ${week.id} (${week.owner}/${week.groupId}/${week.year}/${week.number})`,
      { user: user.id },
    );
    log.error(JSON.stringify(error));
    return;
  }

  if (!weekSched) {
    log.error(
      `No schedule, despite no errors in parsing ${week.id} (${week.owner}/${week.groupId}/${week.year}/${week.number})`,
      { user: user.id },
    );
    return;
  }

  // Process week
  const knownLessons = someoneElsesGroup
    ? await getWeekLessons(user, weekNumber, opts.groupId, { ignoreIet: true })
    : await getWeekLessons(user, weekNumber);
  const updatedTeachers: number[] = [];
  const updatedGroups: number[] = [];
  const updatedFlows: number[] = [];
  const updatedLessons: Lesson[] = [];
  const lessonsInThisWeek: number[] = [];

  log.debug("Updating lessons", { user: user.id });

  const lessonValidUntilDate = new Date(Date.now() + 2592000_000); // 30 days from now
  for (const lessonList of weekSched.lessons) {
    // Create shared info for all lessons in list
    const info = {
      discipline: formatSentence(lessonList.discipline.name),
      conferenceUrl: lessonList.conference?.url,
      weekday: lessonList.weekday.id,
      teacherId: lessonList.teachers[0].id,
      type: getLessonTypeEnum(lessonList.type.id),
      isIet: false,
      dayTimeSlot: lessonList.time.id,
      subgroup: lessonList.groups[0].subgroup,
      groups: lessonList.groups.map((group) => {
        return { id: group.id };
      }),
    };
    if (lessonList.discipline.id === 496) {
      info.type = LessonType.Military;
    }
    // Ensure all groups exist in db. Also check for ssau fuckery
    for (const group of lessonList.groups) {
      if (!updatedGroups.includes(group.id)) {
        await ensureGroupExists(group);
        updatedGroups.push(group.id);
      }

      // Debug-ish
      if (group.subgroup !== info.subgroup) {
        log.error(
          `SSAU Strikes again! Apparently there can be different subgroups on a lesson: ${JSON.stringify(lessonList)}`,
          { user: user.id },
        );
        info.subgroup = null;
      }
    }

    // Identify more lesson types, since i have no idea which id some types have
    if (info.type === LessonType.Unknown) {
      log.error(
        `Unknown type: "${lessonList.type.id}: ${lessonList.type.name}"`,
        { user: user.id },
      );
    }

    // I've never seen multiple teachers in one lesson, so idk.
    if (lessonList.teachers.length > 1) {
      log.error(
        `SSAU Strikes again! Apparently there can be multiple teachers on a lesson: ${JSON.stringify(lessonList)}`,
        { user: user.id },
      );
    }

    if (!updatedTeachers.includes(info.teacherId)) {
      await ensureTeacherExists(lessonList.teachers[0]);
      updatedTeachers.push(info.teacherId);
    }

    for (const lessonInfo of lessonList.weeks) {
      const date = getLessonDate(lessonInfo.week, info.weekday);
      const timeslot = TimeSlotMap[info.dayTimeSlot];
      const weekInfo = {
        id: lessonInfo.id,
        isOnline: !!lessonInfo.isOnline,
        building: lessonInfo.building?.name,
        room: lessonInfo.room?.name,
        weekNumber: lessonInfo.week,
        date: date,
        beginTime: new Date(date.getTime() + timeslot.beginDelta),
        endTime: new Date(date.getTime() + timeslot.endDelta),
        validUntil: lessonValidUntilDate, // 30 days from now
        week:
          lessonInfo.week !== week.number // Create placeholder for other weeks
            ? {
                connectOrCreate: {
                  where: {
                    owner_groupId_year_number: {
                      owner: week.owner,
                      groupId: week.groupId,
                      year: week.year,
                      number: lessonInfo.week,
                    },
                  },
                  create: {
                    owner: week.owner,
                    groupId: week.groupId,
                    year: week.year,
                    number: lessonInfo.week,
                  },
                },
              }
            : undefined, // Current week is handled separately with lessonsInThisWeek
      };
      const lesson = Object.assign({}, weekInfo, info);

      const { groups, ...obj } = lesson;
      const updatedLesson = await db.lesson.upsert({
        where: { id: lesson.id },
        create: Object.assign({}, obj, { groups: { connect: groups } }),
        update: Object.assign({}, obj, { groups: { set: groups } }),
      });

      updatedLessons.push(updatedLesson);
      if (lesson.weekNumber === week.number) lessonsInThisWeek.push(lesson.id);
    }
  }

  if (week.owner !== 0) {
    log.debug("Updating iet lessons", { user: user.id });
    //const flowsToJoin: number[] = [];
    for (const lessonList of weekSched.ietLessons) {
      // Create shared info for all lessons in list
      const info = {
        discipline: formatSentence(lessonList.flows[0].discipline.name),
        conferenceUrl: lessonList.conference?.url,
        weekday: lessonList.weekday.id,
        teacherId: lessonList.teachers[0].id,
        type: getLessonTypeEnum(lessonList.type.id),
        isIet: true,
        dayTimeSlot: lessonList.time.id,
        subgroup: lessonList.flows[0].subgroup,
        flows: lessonList.flows.map((flow) => {
          return { id: flow.id };
        }),
      };
      // Ensure all flows exist in db. Also check for ssau fuckery
      for (const flow of lessonList.flows) {
        if (!updatedFlows.includes(flow.id)) {
          await ensureFlowExists(flow);
          updatedFlows.push(flow.id);
        }

        // Debug-ish
        if (flow.subgroup !== info.subgroup) {
          log.error(
            `SSAU Strikes again! Apparently there can be different subgroups on a lesson: ${JSON.stringify(lessonList)}`,
            { user: user.id },
          );
          info.subgroup = null;
        }
      }

      if (lessonList.flows.length > 1) {
        log.warn(
          `Apparently multiple flows are actually used... ${JSON.stringify(lessonList)}`,
          { user: user.id },
        );
      }

      // Identify more lesson types, since i have no idea which id some types have
      if (info.type === LessonType.Unknown) {
        log.error(
          `Unknown type: "${lessonList.type.id}: ${lessonList.type.name}"`,
          { user: user.id },
        );
      }

      // I've never seen multiple teachers in one lesson, so idk.
      if (lessonList.teachers.length > 1) {
        log.error(
          `SSAU Strikes again! Apparently there can be multiple teachers on a lesson: ${JSON.stringify(lessonList)}`,
          { user: user.id },
        );
      }

      if (!updatedTeachers.includes(info.teacherId)) {
        await ensureTeacherExists(lessonList.teachers[0]);
        updatedTeachers.push(info.teacherId);
      }

      for (const lessonInfo of lessonList.weeks) {
        const date = getLessonDate(lessonInfo.week, info.weekday);
        const timeslot = TimeSlotMap[info.dayTimeSlot];
        const individualInfo = {
          id: lessonInfo.id,
          isOnline: !!lessonInfo.isOnline,
          building: lessonInfo.building?.name,
          room: lessonInfo.room?.name,
          weekNumber: lessonInfo.week,
          date: date,
          beginTime: new Date(date.getTime() + timeslot.beginDelta),
          endTime: new Date(date.getTime() + timeslot.endDelta),
          validUntil: lessonValidUntilDate, // 30 days. Let Week updates and others handle invalidation
          week:
            lessonInfo.week !== week.number // Create placeholder for other weeks
              ? {
                  connectOrCreate: {
                    where: {
                      owner_groupId_year_number: {
                        owner: week.owner,
                        groupId: week.groupId,
                        year: week.year,
                        number: lessonInfo.week,
                      },
                    },
                    create: {
                      owner: week.owner,
                      groupId: week.groupId,
                      year: week.year,
                      number: lessonInfo.week,
                    },
                  },
                }
              : undefined, // Current week is handled separately with lessonsInThisWeek
        };
        const lesson = Object.assign({}, individualInfo, info);

        const { flows, ...obj } = lesson;
        const updatedLesson = await db.lesson.upsert({
          where: { id: lesson.id },
          create: Object.assign({}, obj, { flows: { connect: flows } }),
          update: Object.assign({}, obj, { flows: { set: flows } }),
        });

        updatedLessons.push(updatedLesson);
        if (lesson.weekNumber === week.number)
          lessonsInThisWeek.push(lesson.id);
      }
    }
  } else {
    log.info(`Skipping iet lessons for 'common' owned week`, { user: user.id });
  }

  await db.week.update({
    where: { id: week.id },
    data: {
      lessons: {
        set: lessonsInThisWeek.map((id) => {
          return { id };
        }),
      },
      updatedAt: now,
    },
  });

  if (!weekIsCommon) {
    log.debug(
      `Also updating common week for ${week.groupId}/${week.year}/${week.number}`,
      { user: user.id },
    );
    await db.week.upsert({
      where: {
        owner_groupId_year_number: {
          owner: 0,
          groupId: week.groupId,
          year: week.year,
          number: week.number,
        },
      },
      create: {
        owner: 0,
        groupId: week.groupId,
        year: week.year,
        number: week.number,
        lessons: {
          connect: lessonsInThisWeek.map((id) => {
            return { id };
          }),
        },
        updatedAt: now,
      },
      update: {
        lessons: {
          set: lessonsInThisWeek.map((id) => {
            return { id };
          }),
        },
        updatedAt: now,
      },
    });
  }

  if (updatedFlows.length > 0) {
    await db.user.update({
      where: { id: user.id },
      data: {
        flows: {
          connect: updatedFlows.map((id) => {
            return { id };
          }),
        },
      },
    });
  }

  const newLessons: Lesson[] = [];
  const knownLessonsIds = knownLessons.all.map((i) => i.id);
  for (const updatedLesson of updatedLessons) {
    if (!knownLessonsIds.includes(updatedLesson.id)) {
      // TODO: should also check if updated is iet...
      if (someoneElsesGroup) {
        //ignore
      } else {
        newLessons.push(updatedLesson);
      }
    }
  }
  const missingLessons: number[] = [];
  const updatedLessonIds = updatedLessons.map((i) => i.id);
  for (const knownLesson of knownLessons.all) {
    if (!updatedLessonIds.includes(knownLesson.id)) {
      if (someoneElsesGroup && knownLesson.isIet) {
        //ignore
      } else {
        missingLessons.push(knownLesson.id);
      }
    }
  }

  const removedLessons = await db.lesson.updateManyAndReturn({
    where: {
      // if is missing or left orphaned
      OR: [
        { id: { in: missingLessons } },
        { week: { none: {} } }, // No week
      ],
    },
    data: { validUntil: now },
  });

  if (removedLessons.length) {
    log.debug(
      `Invalidated missing or orphaned lessons: ${JSON.stringify(removedLessons)}`,
    );
  }

  // Invalidate cache for weeks that have had their lessons changed
  // Broken, since i am checking against current week. Invalidates everything
  // const invalidatedWeeks = await db.week.updateManyAndReturn({
  //   where: {
  //     groupId: week.groupId,
  //     lessons: { some: { id: { in: [...missingLessons, ...newLessons] } } },
  //     cachedUntil: { gt: now },
  //   },
  //   data: { cachedUntil: now },
  // });

  //const invalidatedWeekIds = invalidatedWeeks.map((i) => i.id);

  await db.weekImage.updateMany({
    where: { weekId: week.id },
    data: { validUntil: now },
  });

  // TODO Might need to add change detection to individual lessons later
  log.debug(
    `Updated week. Added: [${newLessons.map((i) => i.id).join()}] Removed: [${removedLessons.map((i) => i.id).join()}]`,
    { user: user.id },
  );

  return {
    new: newLessons,
    removed: removedLessons,
  };
}

async function updateWeekRangeForUser(
  opts: {
    weeks: number[];
    user?: User;
    userId?: number;
    groupId?: number;
  } & ({ user: User } | { userId: number }),
) {
  const user =
    opts.user ?? (await db.user.findUnique({ where: { id: opts.userId } }));
  if (!user) throw new Error("User not found");
  if (!user.groupId) await lk.updateUserInfo(user);

  const overrideGroup = opts.groupId; // undefined is fine
  for (const week of opts.weeks) {
    await updateWeekForUser(user, week, { groupId: overrideGroup });
  }
}

export const schedule = {
  updateWeekForUser,
  updateWeekRangeForUser,
  getWeekTimetable,
  getTimetableWithImage,
};
