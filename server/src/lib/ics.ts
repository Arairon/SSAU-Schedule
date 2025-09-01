import { LessonType, User } from "@prisma/client";
import * as ics from "ics";
import { db } from "../db";
import log from "../logger";
import { LessonTypeName } from "./misc";

const LessonTypeIcon: Record<LessonType, string> = {
  Lection: "📗",
  Practice: "📕",
  Lab: "📘",
  Other: "📙",
  // Military: "🫡",
  Window: "🏝",
  Exam: "💀",
  Consult: "🗨",
  // CourseWork: "🤯",
  // Test: "📝",
  Unknown: "❓",
};

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
    return "";
  }
  log.debug("Generating new ics", { user: user.id });
  const now = new Date();
  const normalLessons = await db.lesson.findMany({
    where: {
      validUntil: { gt: now },
      groups: { some: { id: user.groupId! } },
      //subgroup: user.subgroup ?? undefined,
    },
    include: { groups: true, teacher: true },
  });
  const ietLessons = await db.lesson.findMany({
    where: {
      validUntil: { gt: now },
      flows: { some: { user: { some: { id: user.id } } } },
      //subgroup: user.subgroup ?? undefined, //TODO: Figure out if subgroups belong on IET
    },
    include: { flows: true, teacher: true },
  });

  const events: ics.EventAttributes[] = [];

  for (const lesson of [...normalLessons, ...ietLessons]) {
    const event: ics.EventAttributes = {
      calName: "Расписание",
      title:
        `${LessonTypeIcon[lesson.type]} ${lesson.discipline}` +
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
      end: ics.convertTimestampToArray(lesson.endTime.getTime(), "utc"),
      categories: [LessonTypeName[lesson.type]],
    };
    events.push(event);
  }

  console.log(events);

  const { error, value: cal } = ics.createEvents(events);

  if (error) {
    log.error(`Error generating ics ${JSON.stringify(error)}`, {
      user: user.id,
    });
    return "";
  }

  await db.userIcs.upsert({
    where: { id: user.id },
    update: { data: cal, validUntil: new Date(now.getTime() + 86400_000) }, // 1 day
    create: {
      id: user.id,
      data: cal,
      validUntil: new Date(now.getTime() + 86400_000),
    },
  });

  return cal;
}

export async function getUserIcs(userId: number) {
  const now = new Date();
  // const existingCal = await db.userIcs.findUnique({
  //   where: { id: userId, validUntil: { gt: now } },
  // });
  // if (existingCal) {
  //   log.debug("Using cached ics", { user: userId });
  //   return existingCal.data;
  // }
  return generateUserIcs(userId);
}
