import { InputFile, type MessageEntity } from "grammy/types";
import { AsyncTask, CronJob } from "toad-scheduler";
import { db } from "@/db";
import { bot } from "@/bot/bot";
import log from "@/logger";
import { uploadScheduleImage } from "@/bot/imageUploading";
import { getWeekFromDate } from "@ssau-schedule/shared/date";
import { schedule } from "../schedule/requests";
import { TimeSlotMap } from "@ssau-schedule/shared/timeSlotMap";
import {
  formatTimetableDiff,
  getUserPreferences,
  generateTextLesson,
  scheduleMessage,
} from "./misc";
import { DayString } from "@ssau-schedule/shared/utils";
import type { User } from "@/generated/prisma/client";
import { lk } from "../ssau/lk";
import type {
  TimetableDiff,
  TimetableLesson,
} from "@/schedule/types/timetable";
import { formatBigInt } from "@ssau-schedule/shared/utils";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ScheduledMessage = {
  chatId: string;
  text: string;
  entities?: MessageEntity[];
  sendAt: Date;
  source?: string;
  image?: string; // base64
};

export type DbScheduledMessage = {
  chatId: string;
  text: string;
  entities?: object[];
  sendAt: Date;
  source?: string;
  image?: string; // base64
};

export async function sendScheduledNotifications() {
  const now = new Date();
  const messages = await db.scheduledMessage.findMany({
    where: { sendAt: { lte: now }, wasSentAt: null },
    take: 600, // docs say 30/s per inactive, but why risk it... https://limits.tginfo.me/en
  });
  if (messages.length === 0) return;
  log.info(`Sending ${messages.length} pending notifications`, {
    user: "notifications",
  });
  for (const msg of messages) {
    try {
      if (msg.image) {
        await bot.api.sendPhoto(
          msg.chatId,
          new InputFile(Buffer.from(msg.image, "base64")),
          {
            caption: msg.text,
            caption_entities: msg.entities as object[] as MessageEntity[],
          },
        );
      } else {
        await bot.api.sendMessage(msg.chatId, msg.text, {
          entities: msg.entities as object[] as MessageEntity[],
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (e) {
      log.error(
        `Failed to send message #${msg.id} to ${msg.chatId}. Err: ${e as Error}`,
        { user: "notifications" },
      );
    }
  }
  const sentIds = messages.map((i) => i.id);
  await db.scheduledMessage.updateMany({
    where: { id: { in: sentIds } },
    data: { wasSentAt: now },
  });
  log.debug(`Sent ${messages.length}.`, {
    user: "notifications",
  });
}

export function invalidateDailyNotificationsForTarget(target: string) {
  return db.scheduledMessage.updateMany({
    where: { source: { startsWith: "daily" }, wasSentAt: null, chatId: target },
    data: { wasSentAt: new Date(0) },
  });
}

export function invalidateDailyNotificationsForAll() {
  return db.scheduledMessage.updateMany({
    where: { source: { startsWith: "daily" }, wasSentAt: null },
    data: { wasSentAt: new Date(0) },
  });
}

export async function scheduleDailyNotificationsForAll() {
  const now = new Date();
  const weekNumber = getWeekFromDate(now) + (now.getDay() === 0 ? 1 : 0); // if sunday - update next week
  const users = await db.user.findMany({
    where: {
      groupId: { not: null },
    },
  });
  let count = 0;
  for (const user of users) {
    try {
      const res = await scheduleDailyNotificationsForUser(user, weekNumber);
      if (!res) continue;
      count += res.count;
    } catch (e) {
      log.error(
        `Failed to schedule messages for ${weekNumber}@${user.id}: ${e as Error}`,
        {
          user: "dailyNotificationsForAll",
        },
      );
    }
  }
  return count;
}

export async function dailyWeekUpdate() {
  const now = new Date();
  // const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
  // const monthAgo = new Date(Date.now() - 30 * 24 * 3600_000);
  const today = new Date(Date.now() + 42200_000); // add half a day to ensure 'today' and not 'tonight'
  today.setHours(7, 0); // 7 AM in Europe/Samara
  // const year = getCurrentYearId();
  const weekNumber = getWeekFromDate(now) + (now.getDay() === 0 ? 1 : 0); // if sunday - update next week
  await db.week.updateMany({ data: { cachedUntil: now } }); // Invalidate week caches to avoid confusion
  const users = await db.user.findMany({
    where: {
      groupId: { not: null },
    },
  });
  log.info(`Running week update for ${users.length} users`, {
    user: "dailyWeekUpdate",
  });

  const newLessons: TimetableLesson[] = [];
  const removedLessons: TimetableLesson[] = [];

  // TODO: Also check updates for common weeks
  // on todays weeknumber
  for (const user of users) {
    try {
      // const user = await db.user.findUnique({
      //   where: { id: week.owner },
      //   include: { ics: true },
      // });
      // if (!user) {
      //   log.error(`Found orphaned week #${week.id}`, {
      //     user: "dailyWeekUpdate",
      //   });
      //   continue;
      // }

      // // Handled in isAuthed
      // if (!user.authCookie) {
      //   log.debug(`Skipping unauthenticated user #${user.id}`, {
      //     user: "dailyWeekUpdate",
      //   });
      //   continue;
      // }

      // // Needs reworking
      // const isActive = user.lastActive > monthAgo;
      // if (!isActive) {
      //   log.warn(`Found inactive user: #${user.id}/${user.tgId.toString()}`, {
      //     user: "dailyWeekUpdate",
      //   });
      //   continue;
      // }

      let isAuthed = false;
      try {
        isAuthed = await lk.ensureAuth(user);
        if (!isAuthed) {
          log.warn(
            `Failed to ensure auth for user ${user.id}. Probably a lost session`,
            { user: "dailyWeekUpdate" },
          );
          // await scheduleDailyNotificationsForUser(user, weekNumber);
          // continue;
        }
      } catch (e) {
        log.error(`Failed to ensure auth for user ${user.id}: ${e as Error}`, {
          user: "dailyWeekUpdate",
        });
        // await scheduleDailyNotificationsForUser(user, weekNumber);
        // continue;
      }

      // Update current and next weeks
      const currentWeek = await schedule.getTimetableWithImage(
        user,
        weekNumber,
        { forceUpdate: isAuthed, ignoreUpdate: !isAuthed },
      );
      const nextWeek = await schedule.getTimetableWithImage(
        user,
        weekNumber + 1,
        { forceUpdate: isAuthed, ignoreUpdate: !isAuthed },
      );

      await schedule.pregenerateImagesForUser(user, weekNumber + 2, 6); // For now generously pregenerate whole 2 months
      await schedule.pregenerateImagesForUser(user, weekNumber - 1, -2); // and 2 previous weeks for smoother scroll

      const diff = {
        added: [
          ...(currentWeek.timetable.diff?.added ?? []),
          ...(nextWeek.timetable.diff?.added ?? []),
        ],
        removed: [
          ...(currentWeek.timetable.diff?.removed ?? []),
          ...(nextWeek.timetable.diff?.removed ?? []),
        ],
      };

      newLessons.push(...diff.added);
      removedLessons.push(...diff.removed);

      if (diff.added.length > 0 || diff.removed.length > 0) {
        await scheduleLessonChangeNotifications(user, diff);
      }

      await scheduleDailyNotificationsForUser(user, weekNumber);

      await sleep(3000); // To prevent any fun stuff on ssau's end
    } catch (e) {
      log.error(
        `Failed to run daily update for user #${user.id}: ${e as Error}`,
        {
          user: "dailyWeekUpdate",
        },
      );
    }
  }

  log.debug(
    `Total week changes: +${newLessons.length}, -${removedLessons.length}`,
    {
      user: "dailyWeekUpdate",
    },
  );
}

async function scheduleLessonChangeNotifications(
  user: User,
  diff: TimetableDiff,
) {
  const today = new Date();
  if (today.getHours() <= 6) today.setHours(6);
  if (diff.added.length + diff.removed.length === 0) {
    log.debug(`User ${user.id} has no schedule changes.`, {
      user: "scheduleChangeNotifications",
    });
    return;
  }
  log.debug(
    `User ${user.id} has (+${diff.added.length}, -${diff.removed.length}) schedule changes.`,
    {
      user: "scheduleChangeNotifications",
    },
  );
  await scheduleMessage(
    user,
    today,
    `Обнаружены изменения в расписании!\n\n${formatTimetableDiff(diff, "short", 0)}`,
    { source: "dailyupd/changes" },
  );
}

export async function scheduleDailyNotificationsForUser(
  user: User,
  week?: number,
) {
  // const today = new Date(Date.now() + 6 * 3600_000); // add 6h to ensure 'today' and not 'tonight'
  const today = new Date();
  today.setHours(7, 0); // 7 AM in TZ (Europe/Samara)
  const weekNumber = week ?? getWeekFromDate(today);
  const preferences = getUserPreferences(user);
  const timetable = await schedule.getTimetable(user, weekNumber);
  timetable.days.map(
    (d) => (d.lessons = d.lessons.filter((i) => !i.customized?.hidden)),
  );
  const day = timetable.days[today.getDay() - 1];

  if (!day || day.lessons.length === 0) {
    // sunday or no lessons
    return { count: 0 };
  }

  const notifications: ScheduledMessage[] = [];

  if (preferences.notifyBeforeLessons) {
    const deltaMinutes = Math.round(preferences.notifyBeforeLessons / 60);
    const hours = Math.floor(deltaMinutes / 60);
    const minutes = deltaMinutes % 60;
    const windowSpanStr =
      (hours ? `${hours} час${hours === 1 ? "" : "а"} ` : "") +
      (minutes ? `${minutes} минут` : "");

    notifications.push({
      chatId: `${user.tgId}`,
      sendAt: new Date(
        day.beginTime.getTime() - preferences.notifyBeforeLessons * 1000,
      ),
      text: `\
Доброе утро!
Через ${windowSpanStr} начнутся занятия.

Первая пара:
${generateTextLesson(day.lessons[0])}
`,
      source: "daily/daystart",
    });
    // if first notification is 20+ minutes before lesson, send another one
    if (preferences.notifyBeforeLessons >= 1200) {
      notifications.push({
        chatId: `${user.tgId}`,
        sendAt: new Date(day.lessons[0].beginTime.getTime() - 600_000), // 10 minutes before
        text: `Сейчас будет:\n${generateTextLesson(day.lessons[0])}`,
        source: "daily/daystart",
      });
    }
  }

  day.lessons.slice(0, -1).map((lesson, index) => {
    if (preferences.notifyAboutNextLesson) {
      const nextLesson = day.lessons[index + 1];
      if (nextLesson.dayTimeSlot - lesson.dayTimeSlot > 1) {
        const windowSpan =
          TimeSlotMap[nextLesson.dayTimeSlot].beginDelta -
          TimeSlotMap[lesson.dayTimeSlot].endDelta;
        const hours = Math.floor(windowSpan / 3600_000);
        const minutes = Math.floor(windowSpan / 60_000) % 60;
        const windowSpanStr =
          (hours ? `${hours} час${hours === 1 ? "" : "а"} ` : "") +
          (minutes ? `${minutes} минут` : "");
        notifications.push({
          chatId: `${user.tgId}`,
          sendAt: lesson.endTime,
          text: `\
Сейчас будет окно в ${windowSpanStr}

Затем:
${generateTextLesson(nextLesson)}`,
          source: "daily/nextLesson",
        });
        notifications.push({
          chatId: `${user.tgId}`,
          sendAt: new Date(nextLesson.beginTime.getTime() - 600_000), // 10 minutes before
          text: `Сейчас будет:\n${generateTextLesson(nextLesson)}`,
          source: "daily/nextLesson",
        });
      } else {
        notifications.push({
          chatId: `${user.tgId}`,
          sendAt: lesson.endTime,
          text: `Сейчас будет:\n${generateTextLesson(nextLesson)}`,
          source: "daily/nextLesson",
        });
      }
    }
  });

  const nextStudyDay = timetable.days
    .slice(day.weekday)
    .find((day) => day.lessons.length > 0);
  if (preferences.notifyAboutNextDay && day.weekday < 6) {
    if (nextStudyDay) {
      notifications.push({
        chatId: `${user.tgId}`,
        sendAt: day.endTime,
        text: `\
Сегодня больше ничего нет
Следующие занятия ${DayString[nextStudyDay.weekday].in}, ${nextStudyDay.beginTime.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}:

${nextStudyDay.lessons.map((lesson) => generateTextLesson(lesson)).join("\n-----\n")}
`,
        source: "daily/nextDay",
      });
    }
  }

  if (preferences.notifyAboutNextWeek && !nextStudyDay) {
    const timetable = await schedule.getTimetableWithImage(
      user,
      weekNumber + 1,
    );
    notifications.push({
      chatId: `${user.tgId}`,
      sendAt: day.endTime,
      text: "На этой неделе больше ничего нет\nНа фото расписание на следующую неделю",
      image: timetable.image.data.toString("base64"),
      source: "daily/nextWeek",
    });
  }

  const now = new Date();
  const result = await db.scheduledMessage.createMany({
    data: notifications.filter((i) => i.sendAt > now) as DbScheduledMessage[],
  });
  log.debug(
    `Scheduled ${result.count}/${notifications.length} notifications for user ${user.id}`,
    {
      user: "dailyNotifs",
    },
  );
  return result;
}

export async function dailyCleanup() {
  const weekAgo = new Date(Date.now() - 604800_000);

  log.info(`Started daily cleanup`, { user: "dailyCleanup" });

  const results: number[] = [];

  results.push(
    (await db.weekImage.deleteMany({ where: { validUntil: { lt: weekAgo } } }))
      .count,
  );
  results.push(
    (
      await db.scheduledMessage.deleteMany({
        where: { wasSentAt: { lt: weekAgo } },
      })
    ).count,
  );
  results.push(
    (await db.userIcs.deleteMany({ where: { updatedAt: { lt: weekAgo } } }))
      .count,
  );
  results.push(
    (await db.groupIcs.deleteMany({ where: { updatedAt: { lt: weekAgo } } }))
      .count,
  );
  results.push(
    (await db.lesson.deleteMany({ where: { validUntil: { lt: weekAgo } } }))
      .count,
  );

  log.info(
    `Cleanup complete: ${results.join(", ")} (im, msg, uIcs, gIcs, les)`,
    {
      user: "dailyCleanup",
    },
  );
}

export async function uploadWeekImagesWithoutTgId() {
  const startedAtMs = Date.now();
  let total = 0;
  let uploaded = 0;
  let failed = 0;
  let lastProcessedId = 0;
  let totalImageMs = 0;

  while (true) {
    const weekImages = await db.weekImage.findMany({
      where: { tgId: null, id: { gt: lastProcessedId } },
      orderBy: { id: "asc" },
      take: 100,
    });

    if (weekImages.length === 0) {
      break;
    }

    total += weekImages.length;
    lastProcessedId = weekImages[weekImages.length - 1].id;

    for (const weekImage of weekImages) {
      const imageStartedAtMs = Date.now();

      try {
        const uploadedImage = await uploadScheduleImage({
          api: bot.api,
          image: Buffer.from(weekImage.data, "base64"),
          timetableHash: weekImage.timetableHash,
          stylemap: weekImage.stylemap,
          userId: "uploadWeekImagesWithoutTgId",
          // onFallbackAttempt: () => {
          //   log.warn(
          //     `WeekImage #${weekImage.id}: upload mode failed, trying fallback`,
          //     { user: "uploadWeekImagesWithoutTgId" },
          //   );
          // },
        });

        await db.weekImage.update({
          where: { id: weekImage.id },
          data: { tgId: uploadedImage.fileId },
        });
        uploaded += 1;
        const elapsedMs = Date.now() - imageStartedAtMs;
        totalImageMs += elapsedMs;
        // log.debug(
        //   `WeekImage #${weekImage.id}: uploaded in ${formatBigInt(elapsedMs)}ms using ${uploadedImage.mode}`,
        //   {
        //     user: "uploadWeekImagesWithoutTgId",
        //   },
        // );
      } catch (error) {
        failed += 1;
        const elapsedMs = Date.now() - imageStartedAtMs;
        totalImageMs += elapsedMs;
        log.error(
          `WeekImage #${weekImage.id}: failed in ${formatBigInt(elapsedMs)}ms. Error: ${String(error)}`,
          { user: "uploadWeekImagesWithoutTgId" },
        );
      }
    }
  }

  const totalWallMs = Date.now() - startedAtMs;
  const avgImageMs = total > 0 ? Math.round(totalImageMs / total) : 0;

  if (total === 0) {
    log.debug("No week images without tgId found", {
      user: "uploadWeekImagesWithoutTgId",
    });
    return {
      total: 0,
      uploaded: 0,
      failed: 0,
      totalWallMs,
      totalImageMs,
      avgImageMs,
    };
  }

  log.info(
    `Week image upload complete. uploaded=${uploaded}, failed=${failed}, total=${total}, totalWallMs=${totalWallMs}, totalImageMs=${totalImageMs}, avgImageMs=${avgImageMs}`,
    { user: "uploadWeekImagesWithoutTgId" },
  );

  return { total, uploaded, failed, totalWallMs, totalImageMs, avgImageMs };
}

export const intervaljobs = [];

export const cronjobs = [
  new CronJob(
    { cronExpression: "* * * * *" }, // each minute
    new AsyncTask(
      "Send pending scheduled messages",
      sendScheduledNotifications,
    ),
    {
      preventOverrun: true,
    },
  ),
  new CronJob(
    { cronExpression: "0 2 * * *" }, // 2 am
    new AsyncTask(
      "Daily week update and notifications scheduling",
      dailyWeekUpdate,
    ),
    {
      preventOverrun: true,
    },
  ),
  new CronJob(
    { cronExpression: "0 4 * * *" }, // 4 am
    new AsyncTask(
      "Image preupload for week images without tgId",
      uploadWeekImagesWithoutTgId,
    ),
    {
      preventOverrun: true,
    },
  ),
  new CronJob(
    { cronExpression: "0 0 * * *" }, // 0 am
    new AsyncTask("Daily cleanup", dailyCleanup),
    {
      preventOverrun: true,
    },
  ),
];
