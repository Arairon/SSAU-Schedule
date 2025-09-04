import { type MessageEntity } from "telegraf/types";
import { AsyncTask, CronJob } from "toad-scheduler";
import { db } from "../db";
import { bot } from "../bot/bot";
import log from "../logger";
import { getCurrentYearId, getWeekFromDate } from "./utils";
import { schedule, TimeSlotMap } from "./schedule";
import {
  DayString,
  formatDbLesson,
  generateTextLesson,
  scheduleMessage,
  UserPreferencesDefaults,
} from "./misc";
import type { User, Week } from "@prisma/client";
import { lk } from "./lk";

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
    user: "cron/notifications",
  });
  for (const msg of messages) {
    try {
      if (msg.image) {
        await bot.telegram.sendPhoto(
          msg.chatId,
          { source: Buffer.from(msg.image, "base64") },
          {
            caption: msg.text,
            caption_entities: msg.entities as object[] as MessageEntity[],
          },
        );
      } else {
        await bot.telegram.sendMessage(msg.chatId, msg.text, {
          entities: msg.entities as object[] as MessageEntity[],
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (e) {
      log.error(
        `Failed to send message #${msg.id} to ${msg.chatId}. Err: ${e as Error}`,
        { user: "cron/notifications" },
      );
    }
  }
  const sentIds = messages.map((i) => i.id);
  await db.scheduledMessage.updateMany({
    where: { id: { in: sentIds } },
    data: { wasSentAt: now },
  });
  log.debug(`Sent ${messages.length}.`, {
    user: "cron/notifications",
  });
}

export async function dailyWeekUpdate() {
  const now = new Date();
  const weekAgo = new Date(Date.now() - 604800_000);
  const today = new Date(Date.now() + 42200_000); // add half a day to ensure 'today' and not 'tonight'
  today.setHours(7, 0); // 7 AM in Europe/Samara
  const year = getCurrentYearId();
  const weekNumber = getWeekFromDate(now) + (now.getDay() === 0 ? 1 : 0); // if sunday - update next week
  await db.week.updateMany({ data: { cachedUntil: now } }); // Invalidate week caches to avoid confusion
  const weeks = await db.week.findMany({
    where: { number: weekNumber, owner: { not: 0 }, year },
  });
  log.info(`Running week update for ${weeks.length} weeks`, {
    user: "cron/dailyWeekUpdate",
  });

  // on todays weeknumber
  for (const week of weeks) {
    try {
      const user = await db.user.findUnique({
        where: { id: week.owner },
        include: { ics: true },
      });
      if (!user) {
        log.error(`Found orphaned week #${week.id}`, {
          user: "cron/dailyWeekUpdate",
        });
        continue;
      }

      // if (user.id !== 1) {
      //   log.debug("Skipping nonadmin user", { user: "cron/dailyWeekUpdate" });
      //   continue;
      // }
      if (!user.authCookie) {
        log.debug(`Skipping unauthenticated user #${user.id}`, {
          user: "cron/dailyWeekUpdate",
        });
        continue;
      }

      const isActive = user.lastActive > weekAgo;
      if (!isActive) {
        // day before week ago. Basically check if it's the first time user is noticed as inactive
        if (user.lastActive > new Date(Date.now() - 604800_000 - 86400_000)) {
          log.warn(`Found inactive user: #${user.id}/${user.tgId.toString()}`, {
            user: "cron/dailyWeekUpdate",
          });
          await scheduleMessage(
            user,
            today,
            `Приветствую!\nЗа последнюю неделю я не заметил никакой активности с вашей стороны. Если вы хотите продолжить получать уведомления / обновления календаря - просто запросите расписание снова.\nВ противном же случае просто ничего не делайте и я перестану вам докучать :)`,
            { source: "dailyupd/inactive" },
          );
        } else {
          log.debug(
            `Skipping inactive user: #${user.id}/${user.tgId.toString()}`,
            {
              user: "cron/dailyWeekUpdate",
            },
          );
        }
        continue;
      }

      const nextWeekPreUpdates = await db.week.findUnique({
        where: {
          owner_groupId_year_number: {
            owner: week.owner,
            groupId: week.groupId,
            year: week.year,
            number: week.number + 1,
          },
        },
      });
      const nextWeekIsNew =
        !nextWeekPreUpdates || nextWeekPreUpdates.updatedAt < weekAgo;

      try {
        const auth = await lk.ensureAuth(user);
        if (!auth) {
          log.warn(
            `Failed to ensure auth for user ${user.id}. Probably a lost session`,
            { user: "cron/dailyWeekUpdate" },
          );
          await scheduleMessage(
            user,
            today,
            `\
Приветствую!
Произошла ошибка авторизации при попытке обновить ваше расписание.
Пожалуйста, повторно войдите в личный кабинет через /login.`,
            { source: "dailyupd/error" },
          );
        }
      } catch (e) {
        log.error(`Failed to ensure auth for user ${user.id}: ${e as Error}`, {
          user: "cron/dailyWeekUpdate",
        });
        await scheduleMessage(
          user,
          today,
          `\
Приветствую!
Произошла ошибка авторизации при попытке обновить ваше расписание.
Пожалуйста, повторно войдите в личный кабинет через /login.`,
          { source: "dailyupd/error" },
        );
        continue;
      }

      // Update current and next weeks
      const currentWeekChanges = await schedule.updateWeekForUser(
        user,
        week.number,
      );
      await schedule.getTimetableWithImage(user, week.number);

      const nextWeekChanges = await schedule.updateWeekForUser(
        user,
        week.number + 1,
      );
      await schedule.getTimetableWithImage(user, week.number + 1);

      void schedule.pregenerateImagesForUser(user, week.number, 8); // For now generously pregenerate whole 2 months

      if (!currentWeekChanges || !nextWeekChanges) {
        log.error(
          `Failed to update week for user ${user.id} (${week.number}, ${week.number + 1})`,
          { user: "cron/dailyWeekUpdate" },
        );
        continue;
      } else {
        const newLessons = nextWeekIsNew
          ? currentWeekChanges.new
          : currentWeekChanges.new.concat(nextWeekChanges.new);
        const removedLessons = nextWeekIsNew
          ? currentWeekChanges.removed
          : currentWeekChanges.removed.concat(nextWeekChanges.removed);
        newLessons.sort(
          (a, b) => a.beginTime.getTime() - b.beginTime.getTime(),
        );
        removedLessons.sort(
          (a, b) => a.beginTime.getTime() - b.beginTime.getTime(),
        );
        if (newLessons.length > 0 || removedLessons.length > 0) {
          log.debug(
            `User ${user.id} (weeks #${week.number}, #${week.number + 1}${nextWeekIsNew ? " [NEW]" : ""}) has (+${currentWeekChanges.new.length}, +${nextWeekChanges.new.length}, -${currentWeekChanges.removed.length}, -${nextWeekChanges.removed.length}) schedule changes.`,
            {
              user: "cron/dailyWeekUpdate",
            },
          );
          await scheduleMessage(
            user,
            today,
            `\
Обнаружены изменения в расписании!
` +
              (newLessons.length > 0
                ? `
Добавлены занятия:
${newLessons.map(formatDbLesson).join("\n")}
`
                : "") +
              (removedLessons.length > 0
                ? `
Удалены занятия:
${removedLessons.map(formatDbLesson).join("\n")}
`
                : ""),
            { source: "dailyupd/changes" },
          );
        }
      }

      await scheduleDailyNotificationsForUser(user, week);

      await sleep(3000); // To prevent any fun stuff on ssau's end
    } catch (e) {
      log.error(
        `Failed to run daily update for week #${week.id}: ${e as Error}`,
        {
          user: "cron/dailyWeekUpdate",
        },
      );
    }
  }
}

async function scheduleDailyNotificationsForUser(user: User, week: Week) {
  const today = new Date(Date.now() + 6 * 3600_000); // add 6h to ensure 'today' and not 'tonight'
  today.setHours(7, 0); // 7 AM in Europe/Samara
  const preferences = Object.assign(
    {},
    UserPreferencesDefaults,
    user.preferences,
  );
  const timetable = await schedule.getWeekTimetable(user, week.number);
  const day = timetable.days[today.getDay() - 1];

  if (!day || day.lessons.length === 0) {
    // sunday or no lessons
    return;
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
      source: "notifs/daystart",
    });
    // if first notification is 20+ minutes before lesson, send another one
    if (preferences.notifyBeforeLessons >= 1200) {
      notifications.push({
        chatId: `${user.tgId}`,
        sendAt: new Date(day.lessons[0].beginTime.getTime() - 600_000), // 10 minutes before
        text: `Сейчас будет:\n${generateTextLesson(day.lessons[0])}`,
        source: "notifs/daystart",
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
          source: "notifs/nextLesson",
        });
        notifications.push({
          chatId: `${user.tgId}`,
          sendAt: new Date(nextLesson.beginTime.getTime() - 600_000), // 10 minutes before
          text: `Сейчас будет:\n${generateTextLesson(nextLesson)}`,
          source: "notifs/nextLesson",
        });
      } else {
        notifications.push({
          chatId: `${user.tgId}`,
          sendAt: lesson.endTime,
          text: `Сейчас будет:\n${generateTextLesson(nextLesson)}`,
          source: "notifs/nextLesson",
        });
      }
    }
  });

  const nextStudyDay = timetable.days
    .slice(day.weekday)
    .filter((day) => day.lessons.length > 0)
    .at(-1);
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
        source: "notifs/nextDay",
      });
    }
  }

  if (preferences.notifyAboutNextWeek && !nextStudyDay) {
    const timetable = await schedule.getTimetableWithImage(
      user,
      week.number + 1,
    );
    notifications.push({
      chatId: `${user.tgId}`,
      sendAt: day.endTime,
      text: "На этой неделе больше ничего нет\nНа фото расписание на следующую неделю",
      image: timetable.image.data.toString("base64"),
      source: "notifs/nextWeek",
    });
  }

  const now = new Date();
  const result = await db.scheduledMessage.createMany({
    data: notifications.filter((i) => i.sendAt > now) as DbScheduledMessage[],
  });
  log.debug(
    `Scheduled ${result.count}/${notifications.length} notifications for user ${user.id}`,
    {
      user: "cron/dailyNotifs",
    },
  );
}

export async function dailyCleanup() {
  const weekAgo = new Date(Date.now() - 604800_000);

  log.info(`Started daily cleanup`, { user: "cron/dailyCleanup" });

  const results: number[] = [];

  results.push(
    (await db.weekImage.deleteMany({ where: { updatedAt: { lt: weekAgo } } }))
      .count,
  );
  results.push(
    (
      await db.scheduledMessage.deleteMany({
        where: { updatedAt: { lt: weekAgo } },
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

  log.info(`Cleanup complete: ${results.join(", ")}`, {
    user: "cron/dailyCleanup",
  });
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
    { cronExpression: "0 0 * * *" }, // 4 am
    new AsyncTask("Daily cleanup", dailyCleanup),
    {
      preventOverrun: true,
    },
  ),
];
