import type { User, WeekImage } from "@/generated/prisma/client";
import { getWeek } from "@/lib/week";
import log from "@/logger";
import { updateWeekForUser } from "@/ssau/lessons";
import { lk } from "@/ssau/lk";
import { getCurrentYearId, getWeekFromDate } from "@ssau-schedule/shared/date";
import { formatBigInt } from "@ssau-schedule/shared/utils";
import {
  generateTimetable,
  getTimetableHash,
  getTimetablesDiff,
} from "./timetable";
import { UserPreferencesDefaults, type RequestStateUpdate } from "@/lib/misc";
import { db } from "@/db";
import type { Timetable, TimetableDiff } from "./types/timetable";
import { generateTimetableImage } from "./image";

type TimetableWeekLike = {
  timetable: Timetable | null;
  cachedUntil: Date;
};

type UpdatableWeekLike = {
  updatedAt: Date;
};

function hydrateTimetableDates(timetable: Timetable): Timetable {
  timetable.days.forEach((day) => {
    day.beginTime = new Date(day.beginTime);
    day.endTime = new Date(day.endTime);
    day.lessons.forEach((lesson) => {
      lesson.beginTime = new Date(lesson.beginTime);
      lesson.endTime = new Date(lesson.endTime);
    });
  });
  return timetable;
}

function getCachedTimetable(
  week: TimetableWeekLike,
  userId: number,
): Timetable | null {
  const now = new Date();
  if (!week.timetable) return null;

  if (week.cachedUntil > now) {
    log.debug("Timetable good enough. Returning cached", { user: userId });
    return hydrateTimetableDates(week.timetable);
  }

  log.debug("Cached timetable expired. Will generate a new one", {
    user: userId,
  });
  return null;
}

async function updateWeekIfNeeded(
  user: User,
  week: UpdatableWeekLike,
  weekNumber: number,
  year: number,
  groupId: number,
  opts: {
    ignoreUpdate?: boolean;
    forceUpdate?: boolean;
  },
  updateState: (update: RequestStateUpdate<"updatingWeek">) => void,
) {
  if (opts.ignoreUpdate) {
    log.debug(
      `Ignoring updates and generating purely based on current db info`,
      {
        user: user.id,
      },
    );
    return;
  }

  if (opts.forceUpdate) {
    log.debug("Requested forceUpdate. Updating week", { user: user.id });
    updateState({
      state: "updatingWeek",
      message: "Updating week from SSAU",
    });
    await updateWeekForUser(user, weekNumber, { year, groupId });
    return;
  }

  if (Date.now() - week.updatedAt.getTime() > 86400_000) {
    // 1 day
    log.debug("Week updatedAt too old. Updating week", { user: user.id });
    updateState({
      state: "updatingWeek",
      message: "Updating week from SSAU",
    });
    await updateWeekForUser(user, weekNumber, { year, groupId });
    return;
  }

  log.debug("Week updatedAt looks good. Not updating from ssau", {
    user: user.id,
  });
}

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
): Promise<Timetable & { diff?: TimetableDiff }> {
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

  if (!opts?.ignoreCached) {
    const cachedTimetable = getCachedTimetable(week, user.id);
    if (cachedTimetable) {
      return cachedTimetable;
    }
  }

  await updateWeekIfNeeded(
    user,
    week,
    weekNumber,
    year,
    groupId,
    opts ?? {},
    updateState,
  );

  updateState({
    state: "generatingTimetable",
    message: "Generating timetable",
  });

  const timetable = await generateTimetable(user, week.number, {
    groupId: opts?.groupId,
    year: opts?.year,
    ignoreIet: opts?.ignoreIet,
    ignoreSubroup: opts?.ignoreSubroup,
  });

  return {
    ...timetable,
    diff:
      week.timetable && week.timetableHash !== timetable.hash
        ? (getTimetablesDiff(week.timetable, timetable) ?? undefined)
        : undefined,
  };
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
  timetable: Timetable & { diff?: TimetableDiff };
  image: Omit<WeekImage, "data"> & { data: Buffer };
}> {
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

  let timetable: Timetable | null = null;
  let usingCachedTimetable = false;

  if (!opts?.ignoreCached) {
    const cachedTimetable = getCachedTimetable(week, user.id);
    if (cachedTimetable) {
      timetable = cachedTimetable;
      usingCachedTimetable = true;
    }
  }

  await updateWeekIfNeeded(
    user,
    week,
    week.number,
    year,
    groupId,
    opts ?? {},
    updateState,
  );

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
    timetable: {
      ...timetable,
      diff:
        week.timetable && week.timetableHash !== timetable.hash
          ? (getTimetablesDiff(week.timetable, timetable) ?? undefined)
          : undefined,
    },
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
