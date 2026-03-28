import { type MessageEntity } from "grammy/types";
import { AsyncTask, CronJob } from "toad-scheduler";
import { db } from "@/db";
import log from "@/logger";
import { getWeekFromDate } from "@ssau-schedule/shared/date";
import { schedule } from "../schedule/requests";
import { TimeSlotMap } from "@ssau-schedule/shared/timeSlotMap";
import { scheduleMessage } from "./misc";
import {
  formatTimetableDiff,
  generateTextLesson,
} from "@ssau-schedule/shared/misc";
import { DayString, getUserPreferences } from "@ssau-schedule/shared/utils";
import type { User } from "@/generated/prisma/client";
import { lk } from "../ssau/lk";
import type {
  TimetableDiff,
  TimetableLesson,
} from "@ssau-schedule/shared/timetable";
import { formatBigInt } from "@ssau-schedule/shared/utils";
import { botApi } from "./botApiClient";

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
    orderBy: { sendAt: "asc" },
    take: 600, // docs say 30/s per inactive, but why risk it... https://limits.tginfo.me/en
  });
  if (messages.length === 0) return;
  log.info(`Sending ${messages.length} pending notifications`, {
    user: "notifications",
  });
  const res = await botApi.msgs
    .post(
      messages.map((i) => ({ ...i, entities: (i.entities ?? []) as object[] })),
    )
    .then((res) => res.data);

  if (!res) {
    log.error(`Failed to send scheduled notifications: no response from bot`, {
      user: "notifications",
    });
    return;
  }

  if (res.sentIds?.length) {
    await db.scheduledMessage.updateMany({
      where: { id: { in: res.sentIds } },
      data: { wasSentAt: now },
    });
  }
  if (res.rejectedIds?.length) {
    await db.scheduledMessage.updateMany({
      where: { id: { in: res.rejectedIds } },
      data: { wasSentAt: new Date(0) },
    });
  }
  // failed messages will be retried in the next run, so no need to update them

  log.debug(
    `Sent ${res.sentIds.length}. ${res.rejectedIds.length} were rejected. ${res.failedIds.length} have failed.`,
    {
      user: "notifications",
    },
  );
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

export async function dailyUpdate() {
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
    orderBy: { id: "asc" },
  });
  log.info(`Running week update for ${users.length} users`, {
    user: "dailyUpdate",
  });

  const newLessons: TimetableLesson[] = [];
  const removedLessons: TimetableLesson[] = [];

  // TODO: Also check updates for common weeks
  // on todays weeknumber
  for (const user of users) {
    try {
      log.info(`Running daily update for user ${user.tgId}`, {
        user: user.id,
        tag: "dUpd",
      });
      // const user = await db.user.findUnique({
      //   where: { id: week.owner },
      //   include: { ics: true },
      // });
      // if (!user) {
      //   log.error(`Found orphaned week #${week.id}`, {
      //     user: "dailyUpdate",
      //   });
      //   continue;
      // }

      // // Handled in isAuthed
      // if (!user.authCookie) {
      //   log.debug(`Skipping unauthenticated user #${user.id}`, {
      //     user: "dailyUpdate",
      //   });
      //   continue;
      // }

      // // Needs reworking
      // const isActive = user.lastActive > monthAgo;
      // if (!isActive) {
      //   log.warn(`Found inactive user: #${user.id}/${user.tgId.toString()}`, {
      //     user: "dailyUpdate",
      //   });
      //   continue;
      // }

      let isAuthed = false;
      try {
        isAuthed = await lk.ensureAuth(user);
        if (!isAuthed) {
          log.warn(
            `Failed to ensure auth for user ${user.id}. Probably a lost session`,
            { user: "dailyUpdate" },
          );
          // await scheduleDailyNotificationsForUser(user, weekNumber);
          // continue;
        }
      } catch (e) {
        log.error(`Failed to ensure auth for user ${user.id}`, {
          user: "dailyUpdate",
          object: e as object,
        });
        // await scheduleDailyNotificationsForUser(user, weekNumber);
        // continue;
      }

      // Update current and next weeks
      const currentWeek = await schedule.getTimetableWithImage(
        user,
        weekNumber,
        { forceUpdate: isAuthed, ignoreUpdate: !isAuthed, loggingTag: "dUpd" },
      );
      const nextWeek = await schedule.getTimetableWithImage(
        user,
        weekNumber + 1,
        { forceUpdate: isAuthed, ignoreUpdate: !isAuthed, loggingTag: "dUpd" },
      );

      await schedule.pregenerateImagesForUser(user, weekNumber + 2, 6, {
        loggingTag: "dUpd",
      }); // For now generously pregenerate whole 2 months
      await schedule.pregenerateImagesForUser(user, weekNumber - 1, -2, {
        loggingTag: "dUpd",
      }); // and 2 previous weeks for smoother scroll

      const diff = {
        added: [
          ...(currentWeek.timetable.diff?.added ?? []),
          ...(nextWeek.timetable.diff?.added ?? []),
        ],
        removed: [
          ...(currentWeek.timetable.diff?.removed ?? []),
          ...(nextWeek.timetable.diff?.removed ?? []),
        ],
        modified: [
          ...(currentWeek.timetable.diff?.modified ?? []),
          ...(nextWeek.timetable.diff?.modified ?? []),
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
          user: "dailyUpdate",
        },
      );
    }
  }

  log.info(
    `Daily update completed. Took ${formatBigInt(Date.now() - now.getTime())}ms. Total changes: +${newLessons.length}, -${removedLessons.length}`,
    { user: "dailyUpdate" },
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
    user.tgId,
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

  if (
    !(
      preferences.notifyBeforeLessons ||
      preferences.notifyAboutNextLesson ||
      preferences.notifyAboutNextDay ||
      preferences.notifyAboutNextWeek
    )
  ) {
    log.debug(
      `User ${user.id} has no notification preferences enabled. Skipping.`,
      { user: user.id, tag: "dNf" },
    );
    return { count: 0 };
  } else {
    log.info(`Scheduling daily notifications for week ${week ?? "current"}`, {
      user: user.id,
      tag: "dNf",
    });
  }

  if (today.getDay() === 0) {
    // sunday
    return;
  }

  const timetable = await schedule.getTimetable(user, weekNumber, {
    loggingTag: "dNf",
  });
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
    const { timetable, image } = await schedule.getTimetableWithImage(
      user,
      weekNumber + 1,
    );
    try {
      let tgId = image.tgId;
      if (!image.tgId) {
        const uploadedImage = await botApi.images
          .post([
            {
              ...image,
              data: image.data.toBase64(),
              caption: `notifyAboutNextWeek for ${user.id} #${timetable.weekId}\n${timetable.hash}/${image.stylemap}`,
            },
          ])
          .then((res) => res.data?.[0]);
        if (!uploadedImage?.success) {
          log.error(
            `Failed to upload for next week notification. ${uploadedImage ? "Response: " + JSON.stringify(uploadedImage) : "No response from bot"}`,
            { user: user.id, tag: "dailyNW" },
          );
          throw new Error(
            `Failed to upload image for next week notification: ${uploadedImage ? "Response: " + JSON.stringify(uploadedImage) : "No response from bot"}`,
          );
        }
        tgId = uploadedImage.tgId;
        await db.weekImage.update({
          where: { id: image.id },
          data: { tgId: tgId },
        });
      }
      if (!tgId)
        throw new Error("Failed to upload image for next week notification");
      notifications.push({
        chatId: `${user.tgId}`,
        sendAt: day.endTime,
        text: "На этой неделе больше ничего нет\nНа фото расписание на следующую неделю",
        image: tgId,
        source: "daily/nextWeek",
      });
    } catch {
      log.warn(
        `Failed to upload next week image for user. Sending text-only notification.`,
        { user: user.id, tag: "dailyNW" },
      );
      const nextStudyDay = timetable.days.find((day) => day.lessons.length > 0);
      if (nextStudyDay) {
        notifications.push({
          chatId: `${user.tgId}`,
          sendAt: day.endTime,
          text: `\
Сегодня больше ничего нет
Следующие занятия ${DayString[nextStudyDay.weekday].in}, ${nextStudyDay.beginTime.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}:

${nextStudyDay.lessons.map((lesson) => generateTextLesson(lesson)).join("\n-----\n")}
`,
          source: "daily/nextWeek",
        });
      } else {
        notifications.push({
          chatId: `${user.tgId}`,
          sendAt: day.endTime,
          text: `\
Сегодня больше ничего нет
На следующей неделе занятий тоже нет :D
`,
          source: "daily/nextWeek",
        });
      }
    }
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
  // results.push(
  //   (await db.userIcs.deleteMany({ where: { updatedAt: { lt: weekAgo } } }))
  //     .count,
  // );
  // results.push(
  //   (await db.groupIcs.deleteMany({ where: { updatedAt: { lt: weekAgo } } }))
  //     .count,
  // );
  results.push(
    (await db.lesson.deleteMany({ where: { validUntil: { lt: weekAgo } } }))
      .count,
  );

  log.info(`Cleanup complete: ${results.join(", ")} (im, msg, les)`, {
    user: "dailyCleanup",
  });
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
        const uploadedImage = await botApi.images
          .post([
            {
              ...weekImage,
              caption: `preupload of #${weekImage.id}\n${weekImage.timetableHash}/${weekImage.stylemap}`,
            },
          ])
          .then((res) => res.data?.[0]);
        if (!uploadedImage?.success) {
          log.error(
            `Failed to upload for next week notification. ${uploadedImage ? "Response: " + JSON.stringify(uploadedImage) : "No response from bot"}`,
            { user: "uploadWeekImagesWithoutTgId" },
          );
        }

        if (uploadedImage?.success) {
          uploaded += 1;
          await db.weekImage.update({
            where: { id: weekImage.id },
            data: { tgId: uploadedImage.tgId },
          });
        }
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
      dailyUpdate,
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
