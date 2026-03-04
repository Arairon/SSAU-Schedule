import * as ics from "ics";
import { db } from "@/db";
import log from "@/logger";
import {
  getUserPreferences,
  lessonToTimetableLesson,
  LessonTypeIcon,
  LessonTypeName,
} from "../lib/misc";
import { LessonType } from "@/generated/prisma/client";
import { applyCustomization } from "./customLesson";

const ICS_CACHE_TTL_MS = 3600_000;

export async function generateUserIcs(
  userId: number,
  //inp: { user?: User; userId?: number } & ({ user: User } | { userId: number }),
) {
  const user = await db.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    log.error("Attempted to generate ics for no user", { user: userId });
    return null;
  }
  log.debug("Generating new ics", { user: user.id });
  const preferences = getUserPreferences(user);
  const now = new Date();
  const normalLessons = user.groupId
    ? await db.lesson.findMany({
        where: {
          validUntil: { gt: now },
          groups: { some: { id: user.groupId } },
          //subgroup: user.subgroup ?? undefined,
        },
        include: { groups: true, teacher: true },
      })
    : [];
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

  // Fetch custom lessons for this user
  const allLessonIds = [...normalLessons, ...ietLessons].map((l) => l.id);
  const trustedLessonCustomizers = preferences.trustedLessonCustomizers ?? [];

  const customLessons = await db.customLesson.findMany({
    where: {
      AND: [
        {
          OR: [
            { lessonId: { in: allLessonIds } },
            { lessonId: null }, // Standalone custom lessons
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
      isEnabled: true,
    },
    include: { groups: true, teacher: true, flows: true, user: true },
  });

  // Build a map of lessonId -> customization for quick lookup
  const customizationMap = new Map(
    customLessons
      .filter((cl) => cl.lessonId !== null)
      .map((cl) => [cl.lessonId!, cl]),
  );

  const events: ics.EventAttributes[] = [];

  // Process regular lessons with customizations applied
  for (const dblesson of [...normalLessons, ...ietLessons]) {
    const lesson = lessonToTimetableLesson(dblesson);
    if (user.subgroup && lesson.subgroup && user.subgroup !== lesson.subgroup)
      continue;
    if (!preferences.showMilitary && lesson.type === LessonType.Military)
      continue;

    // Check if there's a customization for this lesson
    const customLesson = customizationMap.get(lesson.id);

    // Skip if customization hides this lesson
    if (customLesson?.hideLesson) continue;

    // Apply customizations to lesson properties
    if (customLesson) applyCustomization(lesson, customLesson);

    let teacherName = "Преподаватель не указан";
    if (customLesson?.teacher) {
      teacherName = customLesson.teacher.name;
    } else if (lesson.teacher) {
      teacherName = lesson.teacher.name;
    }

    const event: ics.EventAttributes = {
      title:
        `${LessonTypeIcon[lesson.type]} ${lesson.discipline} ${lesson.isIet ? "[ИОТ]" : ""}` +
        (lesson.subgroup !== null ? ` (${lesson.subgroup})` : "") +
        (customLesson ? " [изм]" : ""),
      description:
        `${teacherName}` +
        (lesson.subgroup !== null ? `\nПодгруппа: ${lesson.subgroup}` : "") +
        (lesson.conferenceUrl ? `\n${lesson.conferenceUrl}` : "") +
        (customLesson?.comment ? `\n\n${customLesson.comment}` : ""),
      location:
        `${LessonTypeName[lesson.type]} / ` +
        (lesson.isOnline ? "Online" : `${lesson.building} - ${lesson.room}`),
      url: lesson.conferenceUrl ?? undefined,
      start: ics.convertTimestampToArray(lesson.beginTime.getTime(), "utc"),
      startInputType: "utc",
      end: ics.convertTimestampToArray(lesson.endTime.getTime(), "utc"),
      endInputType: "utc",
      uid: customLesson
        ? `custom-${customLesson.id}@ssau-schedule-bot`
        : `lesson-${lesson.id}@ssau-schedule-bot`,
      categories: [LessonTypeName[lesson.type]],
    };
    events.push(event);
  }

  // Add standalone custom lessons (not tied to existing lessons)
  for (const customLesson of customLessons.filter(
    (cl) => cl.lessonId === null,
  )) {
    // Apply subgroup filtering
    if (
      user.subgroup &&
      customLesson.subgroup &&
      user.subgroup !== customLesson.subgroup
    )
      continue;

    // Skip if marked as hidden (though this shouldn't happen for standalone lessons)
    if (customLesson.hideLesson) continue;

    const type = customLesson.type ?? LessonType.Unknown;
    const discipline = customLesson.discipline ?? "Неизвестный предмет";
    const isOnline = customLesson.isOnline ?? false;
    const isIet = customLesson.isIet ?? false;
    const building = customLesson.building ?? "?";
    const room = customLesson.room ?? "???";
    const teacherName = customLesson.teacher
      ? customLesson.teacher.name
      : "Преподаватель не указан";

    const event: ics.EventAttributes = {
      title:
        `${LessonTypeIcon[type]} ${discipline} ${isIet ? "[ИОТ]" : ""}` +
        (customLesson.subgroup !== null ? ` (${customLesson.subgroup})` : "") +
        " [доб]", // Mark standalone custom lessons as added
      description:
        `${teacherName}` +
        (customLesson.subgroup !== null
          ? `\nПодгруппа: ${customLesson.subgroup}`
          : "") +
        (customLesson.conferenceUrl ? `\n${customLesson.conferenceUrl}` : "") +
        (customLesson.comment ? `\n\n${customLesson.comment}` : ""),
      location:
        `${LessonTypeName[type]} / ` +
        (isOnline ? "Online" : `${building} - ${room}`),
      url: customLesson.conferenceUrl ?? undefined,
      start: ics.convertTimestampToArray(
        customLesson.beginTime.getTime(),
        "utc",
      ),
      startInputType: "utc",
      end: ics.convertTimestampToArray(customLesson.endTime.getTime(), "utc"),
      endInputType: "utc",
      uid: `custom-${customLesson.id}@ssau-schedule-bot`,
      categories: [LessonTypeName[type]],
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

  const existingCal = await db.userIcs.findUnique({
    where: { id: user.id },
  });

  const cal = rawcal.replace(
    "X-WR-CALNAME",
    `\
X-WR-TIMEZONE:Europe/Samara
COMMENT:Расписание для ${user.fullname}
COMMENT:UUID: ${existingCal?.uuid ?? "[ временно недоступно ]"}
X-WR-CALNAME`,
  ); // A hack to include timezone, since ics lib doesn't support it

  const dbCal = await db.userIcs.upsert({
    where: { id: user.id },
    update: { data: cal, validUntil: new Date(Date.now() + ICS_CACHE_TTL_MS) }, // 1 h
    create: {
      id: user.id,
      data: cal,
      validUntil: new Date(Date.now() + ICS_CACHE_TTL_MS),
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
    where: { uuid },
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
