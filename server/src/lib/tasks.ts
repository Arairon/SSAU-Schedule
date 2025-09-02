import { SimpleIntervalJob, AsyncTask, CronJob } from "toad-scheduler";
import { db } from "../db";
import { bot } from "../bot/bot";
import log from "../logger";
import { getCurrentYearId, getWeekFromDate } from "./utils";
import { schedule } from "./schedule";
import { MessageEntity } from "telegraf/types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const sendScheduledNotifications = new AsyncTask(
  "Send pending scheduled messages",
  async () => {
    const now = new Date();
    const messages = await db.scheduledMessage.findMany({
      where: { sendAt: { lte: now }, wasSentAt: null },
      take: 60, // docs say 30/s per inactive, but why risk it... https://limits.tginfo.me/en
    });
    if (messages.length === 0) return;
    log.info(`Sending ${messages.length} pending notifications`, {
      user: "cron/notifications",
    });
    for (const msg of messages) {
      try {
        await bot.telegram.sendMessage(msg.chatId, msg.text, {
          entities: msg.entities as object[] as MessageEntity[],
        });
      } catch (e) {
        log.error(
          `Failed to send message #${msg.id} to ${msg.chatId}. Err: ${e}`,
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

const dailyWeekUpdate = new AsyncTask("Daily week update", async () => {
  const now = new Date();
  const weekAgo = new Date(Date.now() - 604800_000);
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
    const isActive =
      (user.ics && user.ics.validUntil > weekAgo) || week.cachedUntil > weekAgo;
    if (!isActive) {
      log.warn(`Found inactive user: #${user.id}/${user.tgId.toString()}`, {
        user: "cron/dailyWeekUpdate",
      });
      continue;
    }

    await schedule.updateWeekForUser(user, week.number);

    sleep(3000); // To prevent any fun stuff on ssau's end
  }
});

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
