import type { User, CustomLesson } from "@/generated/prisma/client";
import { LessonType } from "@/generated/prisma/client";
import axios from "axios";
import { formatSentence, md5, formatBigInt } from "@ssau-schedule/shared/utils";
import {
  getLessonDate,
  getWeekFromDate,
  getCurrentYearId,
} from "@ssau-schedule/shared/date";
import { db } from "@/db";
import { lk } from "../ssau/lk";
import log from "@/logger";
import { UserPreferencesDefaults } from "../lib/misc";
import { generateTimetableImage } from "./image";
import type {
  Timetable,
  TimetableDay,
  TimetableLesson,
} from "@/schedule/types/timetable";
import { getWeek, getWeekLessons } from "@/lib/week";
import { updateWeekForUser } from "@/ssau/lessons";

Object.assign(axios.defaults.headers, {
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Expires: "0",
});

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
    void lk.updateUserInfo(user);
    throw new Error(`Groupless user @getWeekTimetable`);
  }

  const week = await getWeek(user, weekN, {
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
    void lk.updateUserInfo(user);
    throw new Error(`Groupless user @getWeekTimetable`);
  }

  const week = await getWeek(user, weekN, {
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

  const timetable: Timetable = {
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

  function applyCustomization(
    lesson: TimetableLesson,
    customLesson: (typeof customLessons)[number],
  ) {
    // DateTime customization is applied beforehand.
    lesson.original = Object.assign({}, lesson);
    lesson.customized = {
      hidden: customLesson.hideLesson,
      disabled: !customLesson.isEnabled,
      customizedBy: customLesson.userId,
      comment: customLesson.comment,
    };

    const propsToCopy: (keyof TimetableLesson & keyof CustomLesson)[] = [
      "discipline",
      "type",
      "isOnline",
      "isIet",
      "building",
      "room",
      "conferenceUrl",
      "subgroup",
      "dayTimeSlot",
      "beginTime",
      "endTime",
    ];
    const changes: Partial<CustomLesson> = Object.fromEntries(
      Object.entries(customLesson).filter(
        ([k, v]) => v && (propsToCopy as string[]).includes(k),
      ),
    );
    Object.assign(lesson, changes);
    if (customLesson.teacher)
      lesson.teacher = {
        name: customLesson.teacher.name,
        id: customLesson.teacherId,
      };
    if (customLesson.groups)
      lesson.groups = customLesson.groups.map((g) => g.name);
    if (customLesson.flows)
      lesson.flows = customLesson.flows.map((f) => f.name);
    lesson.id = customLesson.id;
  }

  for (const lesson of lessons.all) {
    const ttLesson: TimetableLesson = {
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
    if ("groups" in lesson) ttLesson.groups = lesson.groups.map((g) => g.name);
    if ("flows" in lesson) ttLesson.flows = lesson.flows.map((f) => f.name);

    const customLesson = customLessons.find((i) => i.lessonId === lesson.id);
    if (customLesson && customLesson.weekNumber !== timetable.week) continue; // Lesson was moved to another week
    if (!customLesson && lesson.weekNumber !== timetable.week) continue; // Lesson is from another week and was not moved to current by CustomLesson
    if (customLesson) {
      applyCustomization(ttLesson, customLesson);
      if (subgroup && ttLesson.subgroup !== subgroup) continue; // Subgroup filter needs to be applied separately for customizations
    }

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
        alt.alts = [];
      });
      day.lessons = day.lessons.filter((l) => !alts.includes(l));
    } else {
      day.lessonCount += 1;
    }
    day.lessons.push(ttLesson);
  }

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
    const week = await getWeek(user, weekNumber, {
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
  getWeekTimetable,
  getTimetableWithImage,
  pregenerateImagesForUser,
};
