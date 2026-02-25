import * as ics from "ics";
import { db } from "@/db";
import log from "@/logger";
import {
  LessonTypeIcon,
  LessonTypeName,
  UserPreferencesDefaults,
} from "./misc";
import { LessonType } from "@/generated/prisma/client";

export async function generateUserIcs(
  userId: number,
  //inp: { user?: User; userId?: number } & ({ user: User } | { userId: number }),
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { flows: true },
  });
  if (!user) {
    log.error("Attempted to generate ics for no user", { user: userId });
    return null;
  }
  log.debug("Generating new ics", { user: user.id });
  const preferences = Object.assign(
    {},
    UserPreferencesDefaults,
    user.preferences,
  );
  const now = new Date();
  const normalLessons = await db.lesson.findMany({
    where: {
      validUntil: { gt: now },
      groups: { some: { id: user.groupId! } },
      //subgroup: user.subgroup ?? undefined,
    },
    include: { groups: true, teacher: true },
  });
  const ietLessons = preferences.showIet
    ? await db.lesson.findMany({
        where: {
          validUntil: { gt: now },
          flows: { some: { user: { some: { id: user.id } } } },
          //subgroup: user.subgroup ?? undefined, //TODO: Figure out if subgroups belong on IET
        },
        include: { flows: true, teacher: true },
      })
    : [];

  const events: ics.EventAttributes[] = [];

  for (const lesson of [...normalLessons, ...ietLessons]) {
    if (user.subgroup && lesson.subgroup && user.subgroup !== lesson.subgroup)
      continue;
    if (!preferences.showMilitary && lesson.type === LessonType.Military)
      continue;
    const event: ics.EventAttributes = {
      title:
        `${LessonTypeIcon[lesson.type]} ${lesson.discipline} ${lesson.isIet ? "[ИОТ]" : ""}` +
        (lesson.subgroup !== null ? ` (${lesson.subgroup})` : ""),
      description:
        `${lesson.teacher.name}` +
        (lesson.subgroup !== null ? `\nПодгруппа: ${lesson.subgroup}` : "") +
        (lesson.conferenceUrl ? `\n${lesson.conferenceUrl}` : ""),
      location:
        `${LessonTypeName[lesson.type]} / ` +
        (lesson.isOnline ? "Online" : `${lesson.building} - ${lesson.room}`),
      url: lesson.conferenceUrl ?? undefined,
      start: ics.convertTimestampToArray(lesson.beginTime.getTime(), "utc"),
      startInputType: "utc",
      end: ics.convertTimestampToArray(lesson.endTime.getTime(), "utc"),
      endInputType: "utc",
      uid: `lesson-${lesson.id}@ssau-schedule-bot`,
      categories: [LessonTypeName[lesson.type]],
    };
    events.push(event);
  }

  const { error, value: rawcal } = ics.createEvents(events, {
    calName: "Расписание",
    productId: "github.com/arairon/ssau-schedule",
  });

  if (error || !rawcal) {
    log.error(`Error generating ics ${JSON.stringify(error)}`, {
      user: user.id,
    });
    return null;
  }

  const cal = rawcal.replace(
    "X-WR-CALNAME",
    "X-WR-TIMEZONE:Europe/Samara\nX-WR-CALNAME",
  ); // A hack to include timezone, since ics lib doesn't support it

  const dbCal = await db.userIcs.upsert({
    where: { id: user.id },
    update: { data: cal, validUntil: new Date(Date.now() + 3600_000) }, // 1 h
    create: {
      id: user.id,
      data: cal,
      validUntil: new Date(Date.now() + 3600_000),
    },
  });

  await db.user.update({ where: { id: user.id }, data: { lastActive: now } });

  return dbCal;
}

export async function getUserIcsByUserId(userId: number) {
  const now = new Date();
  const existingCal = await db.userIcs.findUnique({
    where: { id: userId },
  });
  if (existingCal && existingCal.validUntil > now) {
    log.debug("Using cached ics", { user: userId });
    return existingCal;
  }
  return generateUserIcs(userId);
}

export async function getUserIcsByUUID(uuid: string) {
  const now = new Date();
  const cal = await db.userIcs.findUnique({
    where: { uuid: uuid },
    include: { user: true },
  });
  if (!cal) {
    log.warn(`Requested invalid ics: ${uuid}`, { user: "?" });
    return null;
  }
  if (cal.validUntil > now) {
    log.debug("Using cached ics", { user: cal.user.id });
    return cal;
  }
  return generateUserIcs(cal.user.id);
}
