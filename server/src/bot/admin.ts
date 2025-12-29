import type { Bot } from "grammy";
import { type Context } from "./types";
import log from "../logger";
import { db } from "../db";
import { env } from "../env";
import {
  dailyWeekUpdate,
  invalidateDailyNotificationsForAll,
  scheduleDailyNotificationsForAll,
  type DbScheduledMessage,
  type ScheduledMessage,
} from "../lib/tasks";
import { CommandGroup } from "@grammyjs/commands";

// Task for any testing that needs to happen
async function taskTest() {
  // nothing
}

export const adminCommands = new CommandGroup<Context>();

export async function initAdmin(bot: Bot<Context>) {
  const commands = adminCommands;

  commands.command("runtask", "Runs a specific task", async (ctx) => {
    if (!ctx.from || !ctx.message) return;
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) return;
    const args = ctx.message.text.split(" ");
    args.shift();
    const arg = args[0]?.trim().toLowerCase();
    switch (arg) {
      case "dailyupd": {
        const msg = await ctx.reply(
          "Запущено ежедневное обновление недель и постановка уведомлений в очередь",
        );
        await dailyWeekUpdate();
        await ctx.api.editMessageText(
          msg.chat.id,
          msg.message_id,
          "Ближайшие недели обновлены. Изображения прегенерированы. Уведомления поставлены в очередь",
        );
        return;
      }
      case "test": {
        await ctx.reply("Выполняю тестовую задачу");
        return taskTest();
      }
      case "renotifs": {
        const res = await invalidateDailyNotificationsForAll();
        await ctx.reply(`Отменена отправка ${res.count} уведомлений`);
        // Fall through to 'notifs'
      }
      case "notifs": {
        const msg = await ctx.reply(
          "Запущена постановка уведомлений в очередь",
        );
        const updResult = await scheduleDailyNotificationsForAll();
        await ctx.api.editMessageText(
          msg.chat.id,
          msg.message_id,
          `${updResult} Уведомлений поставлено в очередь.`,
        );
        break;
      }
      default: {
        return ctx.reply(
          "Задача не найдена\nЗадачи: dailyupd, test, renotifs, notifs",
        );
      }
    }
  });

  commands.command(
    "invalidate",
    "Invalidates various cached info",
    async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) return;
      const args = ctx.message.text.split(" ");
      args.shift();
      const arg = args[0]?.trim().toLowerCase();
      const user = await db.user.findUnique({
        where: { tgId: ctx.from.id },
        include: { ics: true },
      });
      if (!user)
        return ctx.reply(
          `Вас не существует в базе данных, пожалуйста пропишите /start`,
        );
      if (arg === "cache") {
        const now = new Date();
        const target =
          ctx.from.id === env.SCHED_BOT_ADMIN_TGID && args.includes("all")
            ? undefined
            : user.id;
        await db.week.updateMany({
          where: { owner: target },
          data: { cachedUntil: now },
        });
        if (target) {
          await db.user.update({
            where: { id: target },
            data: {
              lastActive: now,
              ics: {
                upsert: {
                  create: { validUntil: now },
                  update: { validUntil: now },
                },
              },
            },
          });
        } else {
          await db.userIcs.updateMany({
            data: { validUntil: now },
          });
        }
        log.debug(
          `Invalidated cached timetables, images and ics for #${target ?? "all"}`,
          { user: ctx.from.id },
        );
        return ctx.reply(
          `Сброшены сгенерированные расписания и календари для #${target ?? "all"}`,
        );
      } else if (arg === "images") {
        if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID)
          return ctx.reply("Нет, спасибо.");
        if (args.includes("hard")) {
          const result = await db.weekImage.deleteMany();
          return ctx.reply(
            `Сброшены все ${result.count} изображений. <i>Как жестоко...</i>`,
            { parse_mode: "HTML" },
          );
        } else {
          const result = await db.weekImage.updateMany({
            data: { validUntil: new Date() },
          });
          return ctx.reply(
            `${result.count} изображений были отмечены невалидными`,
          );
        }
      } else if (arg === "notifs") {
        if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID)
          return ctx.reply("Нет, спасибо.");
        const epoch = new Date(0);
        const result = await db.scheduledMessage.updateMany({
          where: { wasSentAt: null },
          data: { wasSentAt: epoch },
        });
        return ctx.reply(`Отменена отправка ${result.count} сообщений`);
      }
    },
  );

  // debug command used to test error handling
  commands.command("suicide", "Calls `throw` to test error handling", (ctx) => {
    if (!ctx.from || !ctx.message) return;
    if (ctx.from.id === env.SCHED_BOT_ADMIN_TGID) throw new Error("Well, fuck");
    else
      return ctx.reply(
        `Ты. Ужасный. Человек.\n<i>Я серьёзно, тут так и написано: "Ужасный человек"</i>`,
        { parse_mode: "HTML" },
      );
  });

  commands.command(
    "broadcastTest",
    '"Broadcasts" the message back to sender',
    async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) return;
      const text = ctx.message.text.slice(14).trimStart();
      if (!text)
        return ctx.reply("Получено пустое сообщение. Отправка отменена");
      const entities = ctx.message.entities?.slice(1);
      entities?.map((e) => (e.offset -= ctx.message.text.length - text.length));
      await db.scheduledMessage.createMany({
        data: {
          chatId: `${ctx.chat.id}`,
          text,
          entities: entities as object[],
          sendAt: new Date(),
          source: "broadcast",
        },
      });
      const replyHeader = `1 Сообщение следующего содержания\n---\n`;
      entities?.map((e) => (e.offset += replyHeader.length));
      return ctx.reply(
        `${replyHeader}${text}\n---\nБыло поставлено в очередь на отправку`,
        { entities },
      );
    },
  );

  commands.command(
    "broadcast",
    "Broadcasts the message to all bot users",
    async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) return;
      const text = ctx.message.text.slice(10).trimStart();
      if (!text)
        return ctx.reply("Получено пустое сообщение. Отправка отменена");
      const entities = ctx.message.entities?.slice(1);
      entities?.map((e) => (e.offset -= ctx.message.text.length - text.length));
      const users = await db.user.findMany();
      const msgs: ScheduledMessage[] = [];
      const asap = new Date();
      for (const user of users) {
        msgs.push({
          chatId: `${user.tgId.toString()}`,
          text,
          entities: entities,
          sendAt: asap,
          source: "broadcast",
        });
      }
      await db.scheduledMessage.createMany({
        data: msgs as DbScheduledMessage[],
      });
      const replyHeader = `${msgs.length} Сообщений следующего содержания\n---\n`;
      entities?.map((e) => (e.offset += replyHeader.length));
      return ctx.reply(
        `${replyHeader}${text}\n---\nБыло поставлено в очередь на отправку`,
        { entities },
      );
    },
  );

  commands.command(
    "stats",
    "Returns various info about user/bot",
    async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      const user = await db.user.findUnique({
        where: { tgId: ctx.from.id },
        include: { group: true },
      });
      if (!user)
        return ctx.reply(
          `Вас не существует в базе данных, пожалуйста пропишите /start`,
        );
      if (ctx.message.text.includes("admin")) {
        if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID)
          return ctx.reply("Вы не администратор");
        const notifications = await db.scheduledMessage.groupBy({
          by: ["source"],
          where: { wasSentAt: null },
          _count: {
            _all: true,
          },
        });
        const notificationsCount = notifications.reduce(
          (a: number, b) => a + b._count._all,
          0,
        );
        return ctx.reply(`\
Всего пользователей: ${await db.user.count()} (Активных за 30 дней: ${await db.user.count(
          {
            where: {
              lastActive: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              },
            },
          },
        )})
Всего изображений: ${await db.weekImage.count()}
Всего ICS: ${await db.userIcs.count()}
Всего уведомлений в очереди: ${notificationsCount}${notificationsCount ? `\n  - ${notifications.map((i) => `${i.source}: ${i._count._all}`).join("\n  - ")}` : ""}
        `);
      }
      const notifications = await db.scheduledMessage.groupBy({
        by: ["source"],
        where: { chatId: `${user.tgId}`, wasSentAt: null },
        _count: {
          _all: true,
        },
      });
      const notificationsCount = notifications.reduce(
        (a: number, b) => a + b._count._all,
        0,
      );
      return ctx.reply(`\
Вы: ${user.fullname ?? "Неизвестный Пользователь"}
Ваша группа: ${user.group?.name ?? "Отсутствует"} ${user.subgroup ? `(Подгруппа: ${user.subgroup})` : ""}
${
  user.authCookie
    ? `Сессия в ЛК активна ${user.username && user.password ? "(Данные для входа сохранены)" : ""}`
    : `Вы не вошли в ЛК`
}
Уведомлений в очереди: ${notificationsCount}${notificationsCount ? `\n  - ${notifications.map((i) => `${i.source}: ${i._count._all}`).join("\n  - ")}` : ""}
`);
    },
  );

  bot.filter((ctx) => ctx.from?.id === env.SCHED_BOT_ADMIN_TGID).use(commands);
  return commands;
}
