import type { Bot } from "grammy";
import { type Context } from "./types";
import log from "@/logger";
import { env } from "@/env";
import { CommandGroup } from "@grammyjs/commands";
import { formatBigInt } from "@ssau-schedule/shared/utils";
import { api } from "@/serverClient";
import type { MessageEntity } from "grammy/types";
import { getUser } from "./misc";

export type ScheduledMessage = {
  chatId: string;
  text: string;
  entities?: MessageEntity[];
  sendAt: Date;
  source?: string;
  image?: string; // base64
};

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
        await api.tasks.dailyWeekUpdate.post();
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
        const res = await api.tasks.invalidateDailyNotificationsForAll
          .post()
          .then((res) => res.data);
        await ctx.reply(`Отменена отправка ${res?.count} уведомлений`);
        // Fall through to 'notifs'
      }
      case "notifs": {
        const msg = await ctx.reply(
          "Запущена постановка уведомлений в очередь",
        );
        const updResult = await api.tasks.scheduleDailyNotificationsForAll
          .post()
          .then((res) => res.data);
        await ctx.api.editMessageText(
          msg.chat.id,
          msg.message_id,
          `${updResult?.count} Уведомлений поставлено в очередь.`,
        );
        break;
      }
      case "preuploadimages": {
        const imageCount = await api.tasks.unoploadedWeekImagesCount
          .get()
          .then((res) => res.data?.count ?? 0);
        if (imageCount === 0) {
          return ctx.reply("Нет изображений для загрузки");
        }
        const msg = await ctx.reply(
          `Запущена предзагрузка изображений расписаний. Всего: ${imageCount}`,
        );
        const res = await api.tasks.uploadWeekImagesWithoutTgId
          .post()
          .then((res) => res.data);
        if (!res) {
          await ctx.api.editMessageText(
            msg.chat.id,
            msg.message_id,
            `Сервер вернул некорректный ответ.`,
          );
        } else {
          await ctx.api.editMessageText(
            msg.chat.id,
            msg.message_id,
            `Предзагрузка завершена. Всего: ${res.total}, загружено: ${res.uploaded}, ошибок: ${res.failed}, время: ${formatBigInt(res.totalWallMs)}мс (сумма по изображениям: ${formatBigInt(res.totalImageMs)}мс, среднее: ${formatBigInt(res.avgImageMs)}мс/изобр.)`,
          );
        }
        break;
      }
      default: {
        return ctx.reply(
          "Задача не найдена\nЗадачи: dailyupd, test, renotifs, notifs, preuploadImages",
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
      const user = await getUser(ctx, { required: true });
      if (!user) return;
      if (arg === "cache") {
        const target =
          ctx.from.id === env.SCHED_BOT_ADMIN_TGID && args.includes("all")
            ? undefined
            : user.id;
        await api.cache.week.invalidate.patch(
          target ? { owner: target } : { all: true },
        );
        if (target) {
          await api.cache["user-ics"].invalidate.patch({ userId: target });
        } else {
          await api.cache["user-ics"].invalidate.patch({ all: true });
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
          const result = await api.cache["week-image"].invalidate
            .patch({ all: true, hard: true })
            .then((res) => res.data);
          return ctx.reply(
            `Сброшены все ${result?.count} изображений. <i>Как жестоко...</i>`,
            { parse_mode: "HTML" },
          );
        } else {
          const result = await api.cache["week-image"].invalidate
            .patch({ all: true, hard: false })
            .then((res) => res.data);
          return ctx.reply(
            `${result?.count} изображений были отмечены невалидными`,
          );
        }
      } else if (arg === "notifs") {
        if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID)
          return ctx.reply("Нет, спасибо.");
        const result = await api.tasks.clearNotifications
          .post()
          .then((res) => res.data);
        return ctx.reply(`Отменена отправка ${result?.count} сообщений`);
      }

      return ctx.reply("Опции: cache, images, notifs");
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
    "broadcasttest",
    '"Broadcasts" the message back to sender',
    async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) return;
      const text = ctx.message.text.slice(14).trimStart();
      if (!text)
        return ctx.reply("Получено пустое сообщение. Отправка отменена");
      const entities = ctx.message.entities?.slice(1);
      entities?.map((e) => (e.offset -= ctx.message.text.length - text.length));
      const msg = {
        chatId: `${ctx.chat.id}`,
        text,
        entities: entities as object[],
        sendAt: new Date(),
        source: "broadcast",
      };
      await api.tasks.scheduleMessages.post([msg]);
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
      const users = await api.user.all.get().then((res) => res.data ?? []);
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
      await api.tasks.scheduleMessages.post(
        msgs as {
          chatId: string;
          text: string;
          entities: object[];
          sendAt: Date;
          source: string;
        }[],
      );
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
      const user = await getUser(ctx, { required: true });
      if (!user) return;
      if (ctx.message.text.includes("admin")) {
        if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID)
          return ctx.reply("Вы не администратор");
        const stats = await api.tasks.stats.get().then((res) => res.data);
        if (!stats) {
          return ctx.reply("Сервер вернул некорректный ответ.");
        }
        const notificationsCount = stats.notifications.reduce(
          (a: number, b) => a + b.count,
          0,
        );
        return ctx.reply(`\
Всего пользователей: ${stats.usersCount} (Активных за 30 дней: ${stats.usersActiveInLastMonth})
Всего авторизованных: ${stats.usersLoggedIn} (Активных за 30 дней: ${stats.usersLoggedInInLastMonth})
Всего изображений: ${stats.weekImageCount} на ${stats.weekCount} недель
Всего ICS: ${stats.userIcsCount} + ${stats.groupIcsCount}
Всего уведомлений в очереди: ${notificationsCount}${notificationsCount ? `\n  - ${stats.notifications.map((i) => `${i.source}: ${i.count}`).join("\n  - ")}` : ""}
        `);
      }
      return ctx.reply(`\
Вы: ${user.fullname ?? "Неизвестный Пользователь"}
Ваша группа: ${user.group?.name ?? "Отсутствует"} ${user.subgroup ? `(Подгруппа: ${user.subgroup})` : ""}
${
  user.authCookie
    ? `Сессия в ЛК активна ${user.username && user.password ? "(Данные для входа сохранены)" : ""}`
    : `Вы не вошли в ЛК`
}
`);
      // Уведомлений в очереди: ${notificationsCount}${notificationsCount ? `\n  - ${notifications.map((i) => `${i.source}: ${i._count._all}`).join("\n  - ")}` : ""}
    },
  );

  bot.use(commands);
  return commands;
}
