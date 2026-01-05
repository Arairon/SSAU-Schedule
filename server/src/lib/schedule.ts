import type { Lesson, $Enums, User, Week, CustomLesson } from "@prisma/client";
import { LessonType } from "@prisma/client";
import axios from "axios";
import {
  formatSentence,
  md5,
  formatBigInt,
} from "./utils";
import {
  getLessonDate,
  getWeekFromDate,
  getCurrentYearId,
} from "@shared/date"
import { db } from "../db";
import { lk } from "./lk";
import log from "../logger";
import { WeekResponseSchema } from "../schema/schedule";
import {
  ensureFlowExists,
  ensureGroupExists,
  ensureTeacherExists,
  type UserPreferences,
  UserPreferencesDefaults,
} from "./misc";
import { generateTimetableImage } from "./scheduleImage";

Object.assign(axios.defaults.headers, {
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Expires: "0",
});

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

  const lessonIds = lessons.map(i => i.id)

  const customLessons = await db.customLesson.findMany({
    where: {
      OR: [{
        weekNumber: week
      }, {
        lessonId: { in: lessonIds }
      }],
      userId: user.id,
      // type: militaryFilter, // breaks on null
      isEnabled: true, // TODO: Allow viewing disabled customizations or figure out a better way
    },
    include: { groups: true, teacher: true, user: true, flows: true }
  })

  if (ignoreIet) return { lessons, ietLessons: [], customLessons, all: lessons };

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
  return { lessons, ietLessons, customLessons, all: [...lessons, ...ietLessons] };
}

export type TimetableLesson = {
  id: number;
  infoId: number;
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
  original: TimetableLesson | null;
  customized: {
    hidden: boolean;
    disabled: boolean;
    comment: string;
    customizedBy: number;
  } | null;
  alts: TimetableLesson[];
};

export type WeekTimetableDay = {
  // user: number;
  week: number;
  weekday: number;
  beginTime: Date;
  endTime: Date;
  lessons: TimetableLesson[];
  lessonCount: number;
};

export type WeekTimetable = {
  weekId: number;
  // user: number; // To allow sharing hashes
  groupId: number;
  year: number;
  week: number;
  //withIet: boolean;
  //isCommon: boolean;
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
    ignoreUpdate?: boolean;
    ignoreIet?: boolean;
    stylemap?: string;
  },
) {
  const now = new Date();
  const year = (opts?.year ?? 0) || getCurrentYearId();
  const groupId = opts?.groupId ?? user.groupId;
  const preferences = Object.assign(
    {},
    UserPreferencesDefaults,
    user.preferences,
  );
  const stylemap = opts?.stylemap ?? preferences.theme ?? "default";
  if (opts?.forceUpdate) {
    opts.ignoreCached = true;
    opts.ignoreUpdate = false;
  }

  if (!groupId) {
    log.error(`Groupless user @getWeekTimetable`, { user: user.id });
    throw new Error(`Groupless user @getWeekTimetable`);
  }

  const week = await getDbWeek(user, weekN, {
    year,
    groupId,
    nonPersonal: !!opts?.groupId,
  });
  //const weekIsCommon = week.owner === 0; // NonPersonal -> ignore iets
  log.debug(
    `Requested Image ${stylemap}/${week.groupId}/${week.year}/${week.number}`,
    { user: user.id },
  );

  if (
    !opts?.ignoreCached &&
    week.timetable &&
    week.timetableHash &&
    week.cachedUntil > now
  ) {
    const existingImage = await db.weekImage.findUnique({
      where: {
        stylemap_timetableHash: { stylemap, timetableHash: week.timetableHash },
        validUntil: { gt: now },
      },
    });
    if (existingImage) {
      log.debug("Timetable Image good enough. Returning cached", {
        user: user.id,
      });
      const { data: imageData, ...otherData } = existingImage;
      return {
        data: week.timetable,
        image: { ...otherData, data: Buffer.from(imageData, "base64") },
      };
    } else {
      log.debug("Image not found, but timetable is good", {
        user: user.id,
      });
    }
  }

  const usingCachedTimetable =
    !opts?.ignoreCached && week.timetable && week.cachedUntil > now;
  const timetable = usingCachedTimetable
    ? week.timetable!
    : await getWeekTimetable(user, week.number, {
      groupId: opts?.groupId,
      year: week.year,
      ignoreCached: opts?.ignoreCached,
      forceUpdate: opts?.forceUpdate,
      ignoreUpdate: opts?.ignoreUpdate,
      ignoreIet: opts?.ignoreIet,
    });

  const timetableHash =
    usingCachedTimetable && week.timetableHash
      ? week.timetableHash
      : md5(JSON.stringify(timetable));

  if (!opts?.ignoreCached && timetableHash) {
    const existingImage = await db.weekImage.findUnique({
      where: {
        stylemap_timetableHash: {
          stylemap,
          timetableHash,
        },
      },
    });
    if (existingImage) {
      log.debug(`Found a valid image with same timetable hash. Returning`, {
        user: user.id,
      });
      await db.weekImage.update({
        where: { id: existingImage.id },
        data: {
          validUntil: new Date(Date.now() + 4 * 604800_000), // 4 weeks
        },
      });
      return {
        data: timetable,
        image: Object.assign(existingImage, {
          data: Buffer.from(existingImage.data, "base64"),
        }),
      };
    } else {
      log.debug(
        `Could not find a valid image with same hash. Generating new. (hash:${timetableHash})`,
        { user: user.id },
      );
    }
  }

  const image = await generateTimetableImage(timetable, { stylemap });

  //if (!opts?.dontCache) {}
  const createdImage = await db.weekImage.upsert({
    where: {
      stylemap_timetableHash: {
        stylemap: stylemap,
        timetableHash: timetableHash,
      },
    },
    create: {
      stylemap: stylemap,
      timetableHash: timetableHash,
      data: image.toString("base64"),
      validUntil: new Date(Date.now() + 4 * 604800_000), // 4 weeks
    },
    update: {
      data: image.toString("base64"),
      validUntil: new Date(Date.now() + 4 * 604800_000), // 4 weeks
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
    ignoreUpdate?: boolean;
    ignoreIet?: boolean;
  },
) {
  const now = new Date();
  const weekNumber = weekN || getWeekFromDate(now);
  const year = (opts?.year ?? 0) || getCurrentYearId();
  const groupId = opts?.groupId ?? user.groupId;

  if (!groupId) {
    log.error(`Groupless user @getWeekTimetable`, { user: user.id });
    throw new Error(`Groupless user @getWeekTimetable`);
  }

  const week = await getDbWeek(user, weekN, {
    year,
    groupId,
    nonPersonal: !!opts?.groupId,
  });
  const weekIsCommon = week.owner === 0; // NonPersonal -> ignore iets and subgroup options
  const subgroup = weekIsCommon ? null : user.subgroup;

  if (!opts?.ignoreCached && week.timetable) {
    if (week.cachedUntil > now) {
      log.debug("Timetable good enough. Returning cached", { user: user.id });
      week.timetable.days.map((day) => {
        day.beginTime = new Date(day.beginTime);
        day.endTime = new Date(day.endTime);
        day.lessons.map((lesson) => {
          lesson.beginTime = new Date(lesson.beginTime);
          lesson.endTime = new Date(lesson.endTime);
        });
      });
      return week.timetable;
    } else {
      log.debug("Cached timetable expired. Generating new", { user: user.id });
    }
  }

  if (!opts?.ignoreUpdate) {
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
  } else {
    log.debug(
      `Ignoring updates and generating purely based on current db info`,
      { user: user.id },
    );
  }

  log.debug(
    `Week #${week.id} (${week.owner}/${week.groupId}/${week.year}/${week.number}) Generating timetable`,
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
    // user: user.id,
    groupId: week.groupId,
    year: year,
    week: weekNumber,
    //withIet: (opts?.ignoreIet ?? false) || weekIsCommon,
    //isCommon: weekIsCommon,
    days: [],
  };
  for (let dayNumber = 1; dayNumber <= 6; dayNumber++) {
    // Sundays not supported. Hopefully won't have to add them later...
    const date = getLessonDate(weekNumber, dayNumber);
    const dayTimetable: WeekTimetableDay = {
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
  console.log(customLessons)


  function applyCustomization(lesson: TimetableLesson, customLesson: typeof customLessons[number]) {
    // DateTime customization is applied beforehand.
    lesson.original = Object.assign({}, lesson);
    lesson.customized = {
      hidden: customLesson.hideLesson,
      disabled: !customLesson.isEnabled,
      customizedBy: customLesson.userId,
      comment: customLesson.comment
    }

    const propsToCopy: (keyof TimetableLesson & keyof CustomLesson)[] = [
      "discipline", "type", "isOnline", "isIet", "building", "room", "conferenceUrl", "subgroup",
      "dayTimeSlot", "beginTime", "endTime",
    ]
    const changes: Partial<CustomLesson> = Object.fromEntries(Object.entries(customLesson).filter(([k, v]) => v && (propsToCopy as string[]).includes(k)))
    Object.assign(lesson, changes)
    if (customLesson.teacher) lesson.teacher = customLesson.teacher.name;
    if (customLesson.groups) lesson.groups = customLesson.groups.map((g) => g.name);
    if (customLesson.flows) lesson.flows = customLesson.flows.map((f) => f.name);
    lesson.id = customLesson.id;
  }

  for (const lesson of lessons.all) {
    const ttLesson: TimetableLesson = {
      id: lesson.id,
      infoId: lesson.infoId,
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
      customized: null,
      original: null,
    };
    if ("groups" in lesson) ttLesson.groups = lesson.groups.map((g) => g.name);
    if ("flows" in lesson) ttLesson.flows = lesson.flows.map((f) => f.name);

    const customLesson = customLessons.find(i => i.lessonId === lesson.id)
    if (customLesson) applyCustomization(ttLesson, customLesson)

    const day = timetable.days[lesson.weekday - 1];
    if (subgroup && lesson.subgroup && subgroup !== lesson.subgroup) continue;
    day.beginTime =
      lesson.beginTime < day.beginTime ? lesson.beginTime : day.beginTime;
    day.endTime = lesson.endTime > day.endTime ? lesson.endTime : day.endTime;

    const alts = day.lessons.filter(
      (l) => l.dayTimeSlot === lesson.dayTimeSlot,
    );
    if (alts.length > 0) {
      alts.forEach((alt) => {
        ttLesson.alts.push(alt, ...alt.alts);
        alt.alts = []
      });
      day.lessons = day.lessons.filter((l) => !alts.includes(l));
    } else {
      day.lessonCount += 1;
    }
    day.lessons.push(ttLesson);
  }

  customLessons.filter(i => i.lessonId === null).forEach(i => {
    const lesson: TimetableLesson = {
      id: i.id,
      infoId: -1,
      type: i.type ?? LessonType.Unknown,
      discipline: formatSentence(i.discipline ?? "Неизвестный предмет"),
      teacher: i.teacher?.name ?? "Неизвестный Преподаватель",
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
        customizedBy: i.userId
      },
      original: null,
    }

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
        alt.alts = []
      });
      day.lessons = day.lessons.filter((l) => !alts.includes(l));
    } else {
      day.lessonCount += 1;
    }
    day.lessons.push(lesson);

  })


  for (const day of timetable.days) {
    day.lessons.sort((a, b) => a.dayTimeSlot - b.dayTimeSlot);
    if (day.lessonCount === 0) {
      const t = day.beginTime;
      day.beginTime = day.endTime;
      day.endTime = t;
    }
  }

  if (!opts?.dontCache) {
    const timetableHash = md5(JSON.stringify(timetable));
    await db.week.update({
      where: { id: week.id },
      data: {
        timetable,
        timetableHash,
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
      where: { timetableHash },
      data: { validUntil: new Date(Date.now() + 4 * 604800_000) }, // 4 weeks
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
] as const;

async function getDbWeek(
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
    ? await getWeekLessons(user, weekNumber, opts.groupId, {
      ignoreIet: true,
      ignorePreferences: true,
    })
    : await getWeekLessons(user, weekNumber, undefined, {
      ignorePreferences: true,
    });
  const updatedTeachers: number[] = [];
  const updatedGroups: number[] = [];
  const updatedFlows: number[] = [];
  const updatedLessons: Lesson[] = [];
  const lessonsInThisWeek: number[] = [];

  log.debug("Updating lessons", { user: user.id });
  //console.log("KNOWN", knownLessons);

  const lessonValidUntilDate = new Date(Date.now() + 2592000_000); // 30 days from now
  //#region Update normal lessons
  for (const lessonList of weekSched.lessons) {
    // Create shared info for all lessons in list
    const info = {
      infoId: lessonList.id,
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
    // lessonList.discipline.name.trim().toLowerCase() === "военная кафедра"
    if (lessonList.discipline.id === 13173) {
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
  //#endregion

  //#region Update IET lessons
  if (week.owner !== 0) {
    log.debug("Updating iet lessons", { user: user.id });
    //const flowsToJoin: number[] = [];
    for (const lessonList of weekSched.ietLessons) {
      // Create shared info for all lessons in list
      const info = {
        infoId: lessonList.id,
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
  //#endregion

  await db.week.update({
    where: { id: week.id },
    data: {
      lessons: {
        set: lessonsInThisWeek.map((id) => {
          return { id };
        }),
      },
      updatedAt: now,
      cachedUntil: now,
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
  const missingLessonsInfoId: number[] = [];
  //const movedInfoIds: number[] = [];
  const updatedLessonIds = updatedLessons.map((i) => i.id);
  for (const knownLesson of knownLessons.all) {
    if (!updatedLessonIds.includes(knownLesson.id)) {
      if (someoneElsesGroup && knownLesson.isIet) {
        //ignore
      } else {
        //if (newLessons.map((i) => i.infoId).includes(knownLesson.infoId)) {
        //  movedInfoIds.push(knownLesson.infoId);
        //} else {
        missingLessonsInfoId.push(knownLesson.infoId);
        //}
      }
    }
  }

  const orphanedLessons = await db.lesson.updateManyAndReturn({
    where: {
      week: { none: {} }, // No week
      validUntil: { gt: now },
    },
    data: { validUntil: now },
  });
  missingLessonsInfoId.push(...orphanedLessons.map((i) => i.infoId));
  // missingLessonsInfoId.push(
  //  ...orphanedLessons
  //    .map((i) => i.infoId)
  //    .filter((i) => !movedInfoIds.includes(i)),
  // );

  const removedLessons = await db.lesson.updateManyAndReturn({
    where: {
      infoId: { in: missingLessonsInfoId },
      id: { notIn: newLessons.map((i) => i.id) },
      validUntil: { gt: now },
      //updatedAt: { lt: now },
    },
    data: { validUntil: now },
  });

  if (missingLessonsInfoId.length) {
    log.debug(`Invalidating infoIds: [${missingLessonsInfoId.join()}]`);
  }
  if (removedLessons.length) {
    log.debug(
      `Invalidated missing lessons: ${removedLessons.map((i) => i.id).join()} and orphaned: ${orphanedLessons.map((i) => i.id).join()}`,
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

  // TODO Might need to add change detection to individual lessons later
  removedLessons.push(...orphanedLessons);
  log.debug(
    `Updated week. Added: [${newLessons.map((i) => i.id).join()}] Removed: [${removedLessons
      .filter(
        (i) => i.weekNumber === week.number || i.weekNumber === week.number + 1,
      )
      .map((i) => i.id)
      .join()}]`,
    { user: user.id },
  );

  // I wonder if these are needed, since weeks cache now lives only 1h
  // if (
  //   newLessons.length +
  //   removedLessons.filter((i) => i.weekNumber === week.number).length
  // ) {
  //   // Invalidate all week caches if detected changes
  //   await db.week.updateMany({ data: { cachedUntil: now } });
  // }

  return {
    week,
    new: newLessons.filter((i) => i.weekNumber === week.number),
    removed: removedLessons.filter((i) => i.weekNumber === week.number),
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

async function pregenerateImagesForUser(
  user: User,
  week: number,
  count?: number,
  opts?: { groupId?: number; year?: number },
) {
  const startTime = process.hrtime.bigint();
  log.info(`Pregenerating #${week}: ${count ?? 1} images for user.`, {
    user: user.id,
  });
  for (let weekNumber = week; weekNumber < week + (count ?? 1); weekNumber++) {
    const week = await getDbWeek(user, weekNumber, {
      groupId: opts?.groupId,
      year: opts?.year,
    });
    await getTimetableWithImage(
      user,
      week.number,
      Object.assign({}, opts, { ignoreUpdates: true }),
    );
  }
  const endTime = process.hrtime.bigint();
  log.debug(
    `Pregenerated #${week}: ${count ?? 1} images for user. Took: ${formatBigInt(endTime - startTime)}ns`,
    { user: user.id },
  );
}

export const schedule = {
  updateWeekForUser,
  updateWeekRangeForUser,
  getWeekTimetable,
  getTimetableWithImage,
  pregenerateImagesForUser,
};
