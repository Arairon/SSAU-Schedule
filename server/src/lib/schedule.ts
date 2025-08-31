import { $Enums, Lesson, LessonType, User } from "@prisma/client";
import axios from "axios";
import {
  FIRST_STUDY_DAY,
  formatSentence,
  getLessonDate,
  getPersonShortname,
  getWeekFromDate,
} from "./utils";
import { db } from "../db";
import { lk } from "./lk";
import log from "../logger";
import { TeacherType, WeekResponseSchema } from "./scheduleSchemas";
import { env } from "../env";
import {
  ensureFlowExists,
  ensureGroupExists,
  ensureTeacherExists,
} from "./misc";
import { generateTimetableImage } from "./scheduleImage";

function getCurrentYearId() {
  const today = new Date();
  let year = today.getFullYear();
  if (today.getMonth() < 7) year -= 1; // if earlier than august - use previous year
  return year - 2011; // Constant. Blame SSAU
}

async function getWeekLessons(
  user: User,
  week: number,
  groupId?: number,
  opts?: { ignoreIet?: boolean },
) {
  const lessons = await db.lesson.findMany({
    where: {
      weekNumber: week,
      validUntil: { gt: new Date() },
      groups: { some: { id: groupId ?? user.groupId! } },
      isIet: false,
    },
    include: { groups: true, teacher: true },
  });
  if (!opts?.ignoreIet || groupId !== user.groupId)
    return { lessons, ietLessons: [], all: lessons };

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
  id: number;
  user: number;
  week: number;
  groupId: number;
  withIet: boolean;
  foreignGroup: boolean;
  days: WeekTimetableDay[];
};

async function getTimetableWithImage(
  user: User,
  week: number,
  opts?: {
    ignoreCached?: boolean;
    dontCache?: boolean;
    forceUpdate?: boolean;
    ignoreIet?: boolean;
    groupId?: number;
  },
) {
  const weekNumber = week || getWeekFromDate(new Date());
  if (opts && opts?.groupId === user.groupId) opts.groupId = undefined;
  if (opts?.forceUpdate) opts.ignoreCached = true;

  if (!opts?.ignoreCached) {
    const cachedTable = await getWeekTimetableFromCache(
      user,
      weekNumber,
      opts?.groupId ?? user.groupId ?? undefined,
      { requireImage: true },
    );
    if (cachedTable) {
      log.debug("Timetable Image good enough. Returning cached", {
        user: user.id,
      });
      return cachedTable; //buffer.from
    }
  }

  const timetable = await getWeekTimetable(
    user,
    week,
    Object.assign({}, opts, { dontCache: true }),
  );
  const image = await generateTimetableImage(timetable);

  if (!opts?.dontCache) {
    const existing = await db.cachedWeekTimetable.findFirst({
      where: {
        userId: user.id,
        weekNumber: weekNumber,
        validUntil: { gt: new Date() },
      },
    });
    if (existing) {
      timetable.id = existing.id;
      await db.cachedWeekTimetable.update({
        where: { id: existing.id },
        data: {
          userId: user.id,
          weekNumber: weekNumber,
          validUntil: new Date(Date.now() + 86400_000), // 1 day
          data: timetable,
          image: image.toString("base64"),
          groupId: opts?.groupId ?? user.groupId,
        },
      });
    } else {
      const created = await db.cachedWeekTimetable.create({
        data: {
          userId: user.id,
          weekNumber: weekNumber,
          validUntil: new Date(Date.now() + 86400_000), // 1 day
          data: timetable,
          image: image.toString("base64"),
          groupId: opts?.groupId ?? user.groupId,
        },
      });
      timetable.id = created.id;
    }
  }
  return { id: timetable.id, timetable, image: { data: image, tgId: null } };
}

async function getWeekTimetableFromCache(
  user: User,
  week: number,
  groupId?: number,
  opts?: { requireImage?: boolean },
) {
  const timetable = await db.cachedWeekTimetable.findFirst({
    where: {
      userId: user.id,
      weekNumber: week,
      groupId: groupId || undefined,
      validUntil: { gt: new Date() },
      image: opts?.requireImage ? { not: null } : undefined,
    },
    orderBy: { updatedAt: "desc" },
  });
  if (timetable?.data && timetable.image) {
    const table = timetable.data as object as WeekTimetable;
    table.id = timetable.id;
    return {
      id: timetable.id,
      timetable: table,
      image: {
        data: Buffer.from(timetable.image, "base64"),
        tgId: timetable.imageTgId || null,
      },
    };
  }
  return null;
}

async function getWeekTimetable(
  user: User,
  week: number,
  opts?: {
    ignoreCached?: boolean;
    dontCache?: boolean;
    forceUpdate?: boolean;
    ignoreIet?: boolean;
    groupId?: number;
  },
) {
  const weekNumber = week || getWeekFromDate(new Date());
  if (opts && opts?.groupId === user.groupId) opts.groupId = undefined;
  if (opts?.forceUpdate) opts.ignoreCached = true;

  if (!opts?.ignoreCached) {
    const cached = await getWeekTimetableFromCache(
      user,
      weekNumber,
      opts?.groupId ?? user.groupId ?? undefined,
    );
    if (cached) {
      log.debug("Timetable good enough. Returning cached", { user: user.id });
      return cached.timetable;
    }
  }
  const Week =
    opts?.groupId && opts.groupId !== user.groupId
      ? await getDbWeekForFGroup(opts.groupId)
      : await getDbWeek({ user, week: weekNumber });
  if (!Week) {
    log.debug("Requested uncached week. Updating", { user: user.id });
    await updateWeekForUser(user, weekNumber, {
      groupId: opts!.groupId!,
    });
  } else if (Date.now() - Week.updatedAt.getTime() > 86400_000) {
    // 1 day
    log.debug("Timetable too old. Updating week", { user: user.id });
    await updateWeekForUser(user, weekNumber, {
      groupId: opts?.groupId ?? undefined,
    });
  } else if (opts?.forceUpdate) {
    log.debug("Requested forceUpdate. Updating week", { user: user.id });
    await updateWeekForUser(user, weekNumber, {
      groupId: opts?.groupId ?? undefined,
    });
  } else {
    log.debug("Week Timetable looks good.", { user: user.id });
  }
  log.debug(`${Week?.id ?? "[uncached]"} Generating timetable`, {
    user: user.id,
  });
  const lessons = await getWeekLessons(user, weekNumber, opts?.groupId, {
    ignoreIet: opts?.ignoreIet || opts?.groupId !== user.groupId,
  });
  const timetable: WeekTimetable = {
    id: 0,
    user: user.id,
    week: weekNumber,
    groupId: opts?.groupId ?? user.groupId ?? 0,
    withIet: opts?.ignoreIet || opts?.groupId !== user.groupId,
    foreignGroup: opts?.groupId ? opts.groupId !== user.groupId : false,
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
    const existing = await db.cachedWeekTimetable.findFirst({
      where: {
        userId: user.id,
        weekNumber: weekNumber,
        validUntil: { gt: new Date() },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) {
      timetable.id = existing.id;
      await db.cachedWeekTimetable.update({
        where: { id: existing.id },
        data: {
          userId: user.id,
          weekNumber: weekNumber,
          validUntil: new Date(Date.now() + 86400_000), // 1 day
          data: timetable,
          groupId: opts?.groupId ?? user.groupId,
        },
      });
    } else {
      const created = await db.cachedWeekTimetable.create({
        data: {
          userId: user.id,
          weekNumber: weekNumber,
          validUntil: new Date(Date.now() + 86400_000), // 1 day
          data: timetable,
          groupId: opts?.groupId ?? user.groupId,
        },
      });
      timetable.id = created.id;
    }
  }
  return timetable;
}

async function getDbWeekForFGroup(groupId: number) {
  return await db.week.findFirst({
    where: { groupId },
    orderBy: { updatedAt: "desc" },
    take: 1,
  });
}

async function getDbWeek( // TODO: Remake week search. Add common weeks for ietless group search
  inp: (
    | { weekId: string }
    | { userId: number }
    | { user: User }
    | { groupId: number }
  ) & {
    weekId?: string;
    userId?: number;
    groupId?: number;
    user?: User;
    year?: number;
    week?: number;
  },
  opts?: { update?: boolean },
) {
  const now = new Date();
  const upd = opts?.update ? now : undefined;
  if ("weekId" in inp) {
    // Returns week even if no update
    return await db.week.update({
      where: { id: inp.weekId },
      data: { updatedAt: upd },
    });
  }
  const userId = (inp.user ? inp.user.id : inp.userId) ?? undefined;
  const user =
    inp.user ??
    (userId ? await db.user.findUnique({ where: { id: userId } }) : null);
  const owner = user?.id ?? "common";
  const year = inp.year || getCurrentYearId();
  const week = inp.week || getWeekFromDate(now);
  const groupId = inp.groupId || user?.groupId || 0;
  if (!groupId) {
    log.error(`${owner}/${groupId}/${year}/${week} Groupless week`, {
      user: userId,
    });
  }
  const weekId = `${owner}/${groupId}/${year}/${week}`;
  return await db.week.upsert({
    where: { id: weekId },
    create: {
      id: weekId,
      year,
      userId,
      number: week,
      updatedAt: upd,
      groupId,
    },
    update: {
      updatedAt: upd,
      groupId,
    },
  });
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
    type = 0;
  }
  return LessonTypeMap[type];
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

async function updateWeekForUser(
  user: User,
  weekN: number,
  opts?: { groupId?: number },
) {
  const now = new Date();
  const weekNumber = weekN || getWeekFromDate(now);
  const year = getCurrentYearId();
  const week = await getDbWeek(
    {
      userId: user.id,
      year,
      week: weekNumber,
      groupId: opts?.groupId ?? user.groupId ?? undefined,
    },
    { update: true },
  );
  if (!(await lk.ensureAuth(user))) throw new Error("Auth error");
  const someoneElsesGroup = opts?.groupId && opts.groupId !== user.groupId;
  const groupId = someoneElsesGroup ? opts.groupId : user.groupId;
  log.debug(
    `Updating week ${week.id} (${opts?.groupId ?? user.groupId}) ` +
      (someoneElsesGroup ? "[foreign]" : ""),
    { user: user.id },
  );

  const res = await axios.get(
    "https://lk.ssau.ru/api/proxy/timetable/get-timetable",
    {
      headers: {
        Cookie: user.authCookie,
      },
      params: {
        yearId: year,
        week: weekNumber,
        groupId: groupId,
        userType: "student",
      },
    },
  );
  const {
    success,
    error,
    data: weekSched,
  } = WeekResponseSchema.safeParse(res.data);
  if (error) {
    log.error(
      `Error receiving schedule. ${getCurrentYearId()}/${weekNumber}/${user.groupId}`,
      { user: user.id },
    );
    log.error(JSON.stringify(error));
    return;
  }
  if (!weekSched) {
    log.error("No schedule, despite no errors in parsing", { user: user.id });
    return;
  }

  // Process week
  const changes = [] as any[];
  const knownLessons = someoneElsesGroup
    ? await getWeekLessons(user, weekNumber, opts.groupId, { ignoreIet: true })
    : await getWeekLessons(user, weekNumber);
  const updatedTeachers: number[] = [];
  const updatedGroups: number[] = [];
  const updatedFlows: number[] = [];
  const updatedLessons: number[] = [];
  const lessonsInThisWeek: number[] = [];
  log.debug("Updating lessons", { user: user.id });

  const lessonValidUntilDate = new Date(now.getTime() + 2592000_000); // 30 days from now
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
      const lesson = {
        id: lessonInfo.id,
        isOnline: !!lessonInfo.isOnline,
        building: lessonInfo.building?.name,
        room: lessonInfo.room?.name,
        weekNumber: lessonInfo.week,
        date: date,
        beginTime: new Date(date.getTime() + timeslot.beginDelta),
        endTime: new Date(date.getTime() + timeslot.endDelta),
        validUntil: lessonValidUntilDate, // 30 days from now
      };
      Object.assign(lesson, info);

      const { groups, ...obj } = lesson as typeof lesson & typeof info;
      await db.lesson.upsert({
        where: { id: lesson.id },
        create: Object.assign({}, obj, { groups: { connect: groups } }),
        update: Object.assign({}, obj, { groups: { set: groups } }),
      });

      updatedLessons.push(lesson.id);
      if (lesson.weekNumber === week.number) lessonsInThisWeek.push(lesson.id);
    }
  }

  log.debug("Updating iet lessons", { user: user.id });
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
      const weekId = `${someoneElsesGroup ? "common" : user.id}/${groupId}/${year}/${week}`;
      const lesson = {
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
                  where: { id: weekId },
                  create: {
                    id: weekId,
                    userId: user.id,
                    year,
                    number: lessonInfo.week,
                    groupId: opts?.groupId ?? user.groupId!,
                  },
                },
              }
            : undefined, // Current week is handled separately with lessonsInThisWeek
      };
      Object.assign(lesson, info);

      const { flows, ...obj } = lesson as typeof lesson & typeof info;
      await db.lesson.upsert({
        where: { id: lesson.id },
        create: Object.assign({}, obj, { flows: { connect: flows } }),
        update: Object.assign({}, obj, { flows: { set: flows } }),
      });

      updatedLessons.push(lesson.id);
      if (lesson.weekNumber === week.number) lessonsInThisWeek.push(lesson.id);
    }
  }

  await db.week.update({
    where: { id: week.id },
    data: {
      lessons: {
        set: lessonsInThisWeek.map((id) => {
          return { id };
        }),
      },
    },
  });

  for (const knownLesson of knownLessons.all) {
    const missingLessons: number[] = [];
    if (!updatedLessons.includes(knownLesson.id)) {
      if (someoneElsesGroup && knownLesson.isIet) {
        //ignore
      } else {
        missingLessons.push(knownLesson.id);
      }
    }
    const removedLessons = await db.lesson.updateManyAndReturn({
      where: {
        OR: [
          { id: { in: missingLessons } },
          { week: { none: {} } }, // No week
        ],
      },
      data: { validUntil: now },
    }); // TODO: Report these

    await db.cachedWeekTimetable.updateMany({
      where: {
        userId: user.id,
        lessons: { some: { id: { in: missingLessons } } },
        validUntil: { gt: now },
      },
      data: { validUntil: now },
    });
  }
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
