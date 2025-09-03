import { type Telegraf } from "telegraf";
import { fmt, italic } from "telegraf/format";
import { type Context } from "./types";
import log from "../logger";
import { db } from "../db";
import { env } from "../env";
import type { MessageEntity } from "telegraf/types";
import { dailyWeekUpdate } from "../lib/tasks";

type ScheduledMessage = {
  chatId: string;
  text: string;
  entities?: MessageEntity[];
  sendAt: Date;
};

type DbScheduledMessage = {
  chatId: string;
  text: string;
  entities?: object[];
  sendAt: Date;
};

// Task for any testing that needs to happen
async function taskTest() {
  // nothing
}

export async function initAdmin(bot: Telegraf<Context>) {
  bot.command("runtask", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) return;
    const args = ctx.message.text.split(" ");
    args.shift();
    const arg = args[0]?.trim().toLowerCase();
    if (arg === "notifs") {
      const msg = await ctx.reply(
        "Запущено обновление недель постановка уведомлений в очередь",
      );
      await dailyWeekUpdate();
      await ctx.telegram.editMessageText(
        msg.chat.id,
        msg.message_id,
        undefined,
        "Ближайшие недели обновлены. Уведомления поставлены в очередь",
      );
      return;
    } else if (arg === "test") {
      await ctx.reply("Выполняю тестовую задачу");
      await taskTest();
    } else {
      return ctx.reply("Задача не найдена");
    }
  });

  bot.command("invalidate", async (ctx) => {
    // TODO: disable invalidation for nonadmin
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
      log.debug(
        `Invalidated cached timetables, images and ics for #${target ?? "all"}`,
        { user: ctx.from.id },
      );
      return ctx.reply(
        `Сброшены сгенерированные расписания, изображения и календари для #${target ?? "all"}`,
      );
    }
  });

  // debug command used to test error handling
  bot.command("suicide", (ctx) => {
    if (ctx.from.id === env.SCHED_BOT_ADMIN_TGID) throw new Error("Well, fuck");
    else
      return ctx.reply(
        fmt`Ты. Ужасный. Человек.\n${italic('Я серьёзно, тут так и написано: "Ужасный человек"')}`,
      );
  });

  bot.command("broadcastTest", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) return;
    const text = ctx.message.text.slice(14).trimStart();
    if (!text) return ctx.reply("Получено пустое сообщение. Отправка отменена");
    const entities = ctx.message.entities?.slice(1);
    entities?.map((e) => (e.offset -= ctx.message.text.length - text.length));
    await db.scheduledMessage.createMany({
      data: {
        chatId: `${ctx.chat.id}`,
        text,
        entities: entities as object[],
        sendAt: new Date(),
      },
    });
    const replyHeader = `1 Сообщение следующего содержания\n---\n`;
    entities?.map((e) => (e.offset += replyHeader.length));
    return ctx.reply(
      `${replyHeader}${text}\n---\nБыло поставлено в очередь на отправку`,
      { entities },
    );
  });

  bot.command("broadcast", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) return;
    const text = ctx.message.text.slice(10).trimStart();
    if (!text) return ctx.reply("Получено пустое сообщение. Отправка отменена");
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
  });
}
