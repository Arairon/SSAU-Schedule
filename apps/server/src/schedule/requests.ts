import type { User, WeekImage } from "@/generated/prisma/client";
import { getWeek } from "@/lib/week";
import log from "@/logger";
import { updateWeekForUser } from "@/ssau/lessons";
import { lk } from "@/ssau/lk";
import { getCurrentYearId, getWeekFromDate } from "@ssau-schedule/shared/date";
import { formatBigInt } from "@ssau-schedule/shared/utils";
import { generateTimetable, getTimetableHash } from "./timetable";
import { UserPreferencesDefaults, type RequestStateUpdate } from "@/lib/misc";
import { db } from "@/db";
import type { Timetable } from "./types/timetable";
import { generateTimetableImage } from "./image";

export async function getTimetable(
  user: User,
  weekN: number,
  opts?: {
    groupId?: number; // User requests a group's schedule instead of personal.
    year?: number;
    ignoreCached?: boolean; // Ignore cached timetable even if it's still valid.
    ignoreUpdate?: boolean; // Don't update week from SSAU even if it's old.
    forceUpdate?: boolean; // Force update week from SSAU.
    dontCache?: boolean; // Don't cache generated timetable to DB
    ignoreIet?: boolean;
    ignoreSubroup?: boolean;
    onUpdate?: (
      update: RequestStateUpdate<"updatingWeek" | "generatingTimetable">,
    ) => void;
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

  function updateState(
    update: RequestStateUpdate<"updatingWeek" | "generatingTimetable">,
  ) {
    if (opts?.onUpdate) opts.onUpdate(update);
  }

  const week = await getWeek(user, weekN, {
    year,
    groupId,
    nonPersonal: !!opts?.groupId,
  });

  // TODO: Review which opts cannot be cached (or cache them separately) instead of ignoring cache entirely.

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
      log.debug("Cached timetable expired. Will generate a new one", {
        user: user.id,
      });
    }
  }

  if (!opts?.ignoreUpdate) {
    if (opts?.forceUpdate) {
      log.debug("Requested forceUpdate. Updating week", { user: user.id });
      updateState({
        state: "updatingWeek",
        message: "Updating week from SSAU",
      });
      await updateWeekForUser(user, weekNumber, { year, groupId });
    } else if (Date.now() - week.updatedAt.getTime() > 86400_000) {
      // 1 day
      log.debug("Week updatedAt too old. Updating week", { user: user.id });
      updateState({
        state: "updatingWeek",
        message: "Updating week from SSAU",
      });
      await updateWeekForUser(user, weekNumber, { year, groupId });
    } else {
      log.debug("Week updatedAt looks good. Not updating from ssau", {
        user: user.id,
      });
    }
  } else {
    log.debug(
      `Ignoring updates and generating purely based on current db info`,
      { user: user.id },
    );
  }

  updateState({
    state: "generatingTimetable",
    message: "Generating timetable",
  });
  return generateTimetable(user, week.number, {
    groupId: opts?.groupId,
    year: opts?.year,
    ignoreIet: opts?.ignoreIet,
    ignoreSubroup: opts?.ignoreSubroup,
  });
}

async function getTimetableWithImage(
  user: User,
  weekN: number,
  opts?: {
    groupId?: number;
    year?: number;
    stylemap?: string;
    ignoreCached?: boolean; // Ignore cached timetable even if it's still valid.
    ignoreUpdate?: boolean; // Don't update week from SSAU even if it's old.
    forceUpdate?: boolean; // Force update week from SSAU.
    dontCache?: boolean; // Don't cache generated timetable to DB
    ignoreIet?: boolean;
    ignoreSubroup?: boolean;
    onUpdate?: (
      update: RequestStateUpdate<
        "updatingWeek" | "generatingTimetable" | "generatingImage"
      >,
    ) => void;
  },
): Promise<{
  timetable: Timetable;
  image: Omit<WeekImage, "data"> & { data: Buffer };
}> {
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

  function updateState(
    update: RequestStateUpdate<
      "updatingWeek" | "generatingTimetable" | "generatingImage"
    >,
  ) {
    if (opts?.onUpdate) opts.onUpdate(update);
  }

  const week = await getWeek(user, weekN, {
    year,
    groupId,
    nonPersonal: !!opts?.groupId,
  });

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
        timetable: week.timetable,
        image: { ...otherData, data: Buffer.from(imageData, "base64") },
      };
    } else {
      log.debug("Image not found, but timetable is good", {
        user: user.id,
      });
    }
  }

  let timetable: Timetable | null = null;
  let usingCachedTimetable = false;

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
      timetable = week.timetable;
      usingCachedTimetable = true;
    } else {
      log.debug("Cached timetable expired. Will generate a new one", {
        user: user.id,
      });
    }
  }

  if (!opts?.ignoreUpdate) {
    if (opts?.forceUpdate) {
      log.debug("Requested forceUpdate. Updating week", { user: user.id });
      updateState({
        state: "updatingWeek",
        message: "Updating week from SSAU",
      });
      await updateWeekForUser(user, week.number, { year, groupId });
    } else if (Date.now() - week.updatedAt.getTime() > 86400_000) {
      // 1 day
      log.debug("Week updatedAt too old. Updating week", { user: user.id });
      updateState({
        state: "updatingWeek",
        message: "Updating week from SSAU",
      });
      await updateWeekForUser(user, week.number, { year, groupId });
    } else {
      log.debug("Week updatedAt looks good. Not updating from ssau", {
        user: user.id,
      });
    }
  } else {
    log.debug(
      `Ignoring updates and generating purely based on current db info`,
      { user: user.id },
    );
  }

  if (!timetable) {
    updateState({
      state: "generatingTimetable",
      message: "Generating timetable",
    });
    timetable = await generateTimetable(user, week.number, {
      groupId: opts?.groupId,
      year: opts?.year,
      ignoreIet: opts?.ignoreIet,
      ignoreSubroup: opts?.ignoreSubroup,
    });
  }

  const timetableHash = usingCachedTimetable
    ? (week.timetableHash ?? getTimetableHash(timetable))
    : getTimetableHash(timetable);

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
        timetable,
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

  updateState({
    state: "generatingImage",
    message: "Generating timetable image",
  });
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
    timetable,
    image: Object.assign(createdImage, { data: image }),
  };
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
  pregenerateImagesForUser,
  getTimetable,
  getTimetableWithImage,
  generateTimetable,
  generateTimetableImage,
};
