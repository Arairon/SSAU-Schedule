import { type MessageEntity } from "telegraf/types";
import { AsyncTask, CronJob } from "toad-scheduler";
import { db } from "../db";
import { bot } from "../bot/bot";
import log from "../logger";
import { getCurrentYearId, getWeekFromDate } from "./utils";
import { schedule } from "./schedule";
import {
  DayString,
  generateTextLesson,
  scheduleMessage,
  UserPreferencesDefaults,
} from "./misc";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const sendScheduledNotifications = new AsyncTask(
  "Send pending scheduled messages",
  async () => {
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
  },
);

const dailyWeekUpdate = new AsyncTask(
  "Daily week update and notifications scheduling",
  async () => {
    const now = new Date();
    const weekAgo = new Date(Date.now() - 604800_000);
    const today = new Date(Date.now() + 42200_000); // add half a day to ensure 'today' and not 'tonight'
    today.setHours(8, 0); // 12 AM in Europe/Samara
    const year = getCurrentYearId();
    const weekNumber = getWeekFromDate(now) + (now.getDay() === 0 ? 1 : 0); // if sunday - update next week
    const weeks = await db.week.findMany({
      where: { number: weekNumber, owner: { not: 0 }, year },
    });
    log.info(`Running week update for ${weeks.length} weeks`, {
      user: "cron/dailyWeekUpdate",
    });

    for (const week of weeks) {
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
      const preferences = Object.assign(
        {},
        UserPreferencesDefaults,
        user.preferences,
      );
      const isActive = user.lastActive < weekAgo;
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

      const currentWeekChanges = await schedule.updateWeekForUser(
        user,
        week.number,
      );
      const nextWeekChanges = await schedule.updateWeekForUser(
        user,
        week.number + 1,
      );
      // TODO: Schedule changes notifications

      const timetable = await schedule.getWeekTimetable(user, week.number);
      const day = timetable.days[today.getDay() - 1];

      if (!day || day.lessons.length === 0) {
        // sunday or no lessons
        await sleep(3000);
        continue;
      }

      if (preferences.notifyBeforeLessons) {
        const deltaMinutes = Math.round(preferences.notifyBeforeLessons / 60);
        const minutes = deltaMinutes % 10 === 1 ? "минуту" : "минут";
        await scheduleMessage(
          user,
          new Date(
            day.beginTime.getTime() - preferences.notifyBeforeLessons * 1000,
          ),
          `\
Доброе утро!
Через ${deltaMinutes} ${minutes} начнутся занятия.
Первая пара:
${generateTextLesson(day.lessons[0])}
`,
        );
      }

      day.lessons.slice(0, -1).map((lesson, index) => {
        if (preferences.notifyAboutNextLesson) {
          const nextLesson = day.lessons[index + 1];
          void scheduleMessage(
            user,
            lesson.endTime,
            `Сейчас будет:\n${generateTextLesson(nextLesson)}`,
          );
        }
      });

      const nextStudyDay = timetable.days
        .slice(day.weekday)
        .filter((day) => day.lessons.length > 0)
        .at(-1);
      if (preferences.notifyAboutNextDay && day.weekday < 6) {
        if (nextStudyDay) {
          await scheduleMessage(
            user,
            day.endTime,
            `\
Сегодня больше ничего нет
Следующие занятия ${DayString[nextStudyDay.weekday].in}, ${nextStudyDay.beginTime.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}:

${nextStudyDay.lessons.map((lesson) => generateTextLesson(lesson)).join("\n-----\n")}
`,
          );
        }
      }

      if (preferences.notifyAboutNextWeek && !nextStudyDay) {
        const timetable = await schedule.getTimetableWithImage(
          user,
          week.number + 1,
        );
        void scheduleMessage(
          user,
          day.endTime,
          "Сегодня больше ничего нет\nНа фото расписание на следующую неделю",
          {
            image: timetable.image.data.toString("base64"),
          },
        );
      }

      await sleep(3000); // To prevent any fun stuff on ssau's end
    }
  },
);

const dailyCleanup = new AsyncTask("Daily cleanup", async () => {
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
});

export const intervaljobs = [];

export const cronjobs = [
  new CronJob({ cronExpression: "* * * * *" }, sendScheduledNotifications, {
    preventOverrun: true,
  }),
  new CronJob({ cronExpression: "0 1 * * *" }, dailyWeekUpdate, {
    preventOverrun: true,
  }),
  new CronJob({ cronExpression: "0 0 * * *" }, dailyCleanup, {
    preventOverrun: true,
  }),
];
