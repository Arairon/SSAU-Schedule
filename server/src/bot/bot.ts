import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import {
  Input,
  Markup,
  Scenes,
  session,
  Telegraf,
  type Context as TelegrafContext,
  type SessionStore,
} from "telegraf";
import { message } from "telegraf/filters";
import { env } from "../env";

import { Context, Session } from "./types";
import log from "../logger";
import { db } from "../db";
import { bold, fmt, italic } from "telegraf/format";
import { lk } from "../lib/lk";
import {
  formatBigInt,
  getPersonShortname,
  getWeekFromDate,
} from "../lib/utils";
import { loginScene } from "./scenes/login";
import { schedule } from "../lib/schedule";
import { CallbackQuery, Message, MessageEntity, Update } from "telegraf/types";
import {
  findGroup,
  findGroupOrOptions,
  UserPreferencesDefaults,
} from "../lib/misc";
import { STYLEMAPS } from "../lib/scheduleImage";
import { initSchedule, sendTimetable } from "./schedule";
import { initOptions } from "./options";

function getDefaultSession(): Session {
  return {
    sceneData: {},
    loggedIn: false,
    options: {
      message: 0,
      menu: "",
      updText: null,
    },
    scheduleViewer: {
      message: 0,
      chatId: 0,
      week: 0,
      groupId: undefined,
    },
  };
}

async function reset(ctx: Context, userId: number) {
  await db.user.delete({ where: { id: userId } });
}

async function start(ctx: Context, userId: number) {
  await db.user.create({ data: { tgId: userId } });
  Object.assign(ctx.session, getDefaultSession());
  ctx.reply(fmt`
Добро пожаловать!
Этот бот создан в первую очередь для работы для работы с личным кабинетом самарского университета.
Возможность делать анонимные запросы возможно будет добавлена позже.
Для начала потребуется войти в личный кабинет. Вы можете это сделать по команде /login
Каковы гарантии что я не украду ваш аккаунт лк? Никаких :)
Ну а если серьёзно, то зачем оно мне надо...
    `);
}

const stage = new Scenes.Stage([loginScene]);

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

async function sendErrorMessage(ctx: Context, comment?: string) {
  try {
    ctx.reply(
      `Что-то пошло не так. Свяжитесь с ${env.SCHED_BOT_ADMIN_CONTACT}.\n${comment ?? ""}`,
    );
  } catch {
    log.error("Error occured during sendErrorMessage. Ignoring.", {
      user: ctx?.from?.id ?? ctx.chat?.id ?? "unknown",
    });
  }
}

export async function handleError(ctx: Context, error: any) {
  sendErrorMessage(ctx);
  log.error(`Bot threw an error: E: ${JSON.stringify(error)}`, {
    user: ctx?.from?.id ?? ctx.chat?.id ?? "unknown",
  });
  if (env.NODE_ENV === "development") throw error;
}

//TODO: Ensure commands are guarded against non logged in users or fall them back to 'common'
async function init_bot(bot: Telegraf<Context>) {
  bot.launch(() => {
    log.info("Bot started!");
    if (env.SCHED_BOT_ADMIN_TGID && env.NODE_ENV === "production") {
      try {
        bot.telegram.sendMessage(env.SCHED_BOT_ADMIN_TGID, "Bot started!");
      } catch {
        log.error("Failed to notify admin about bot start");
      }
    }
  });

  bot.use(stage.middleware());

  bot.use((ctx: Context, next) => {
    if (ctx.message && "text" in ctx.message)
      log.debug(`${ctx.message.text}`, { user: ctx?.from?.id ?? -1 });
    next();
  });

  bot.catch((err, ctx) => {
    handleError(ctx, err);
  });

  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const existingUser = await db.user.findUnique({
      where: { tgId: ctx.from.id },
    });
    if (!existingUser) {
      start(ctx, userId);
    } else {
      const msg = await ctx.reply(
        fmt`
Вы уверены что хотите сбросить все настройки?
Будет сброшено всё: Календари, настроки, данные для входа, группы и т.п.
        `,
        Markup.inlineKeyboard([
          Markup.button.callback("Отмена", "start_reset_cancel"),
          Markup.button.callback("Да, сбросить", "start_reset_confirm"),
        ]),
      );
    }
  });

  bot.action("start_reset_cancel", async (ctx) => {
    log.debug("start_reset_cancel", { user: ctx.from.id });
    if (ctx.callbackQuery.message?.message_id)
      ctx.deleteMessage(ctx.callbackQuery.message?.message_id);
    await ctx.answerCbQuery();
  });

  bot.action("start_reset_confirm", async (ctx) => {
    log.debug("start_reset_confirm", { user: ctx.from.id });
    if (ctx.callbackQuery.message?.message_id)
      ctx.deleteMessage(ctx.callbackQuery.message?.message_id);
    await ctx.answerCbQuery();
    reset(ctx, ctx.from.id).then(() => start(ctx, ctx.from.id));
  });

  bot.command("login", async (ctx) => {
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (user) {
      ctx.session.loggedIn = true;
      if (user.username && user.password) {
        const msg = await ctx.reply(fmt`
Вы уже вошли как '${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")} (${user.username})'.
Если вы хотите выйти - используйте /logout
      `);
        return;
      }
      if (user.authCookie && user.sessionExpiresAt > new Date()) {
        const msg = await ctx.reply(fmt`
Ваша сессия как '${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")}' всё ещё активна.
Если вы хотите её прервать, используйте /logout
      `);
        return;
      }
    }
    ctx.deleteMessage(ctx.message.message_id);
    return ctx.scene.enter("LK_LOGIN");
  });

  bot.command("logout", async (ctx) => {
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      ctx.reply("Вас не существует в базе данных. Пожалуйста пропишите /start");
      return;
    }
    const hadCredentials = user.username && user.password;
    await lk.resetAuth(user!, { resetCredentials: true });
    const msg = await ctx.reply(
      fmt`
Сессия завершена. ${hadCredentials ? "Данные для входа удалены." : ""}
Внимание: Если вы собираетесь в будующем входить в ${bold("другой")} аккаунт ссау, то вам следует сбросить данные о себе через /start
Если же вы собираетесь продолжать использовать текущий аккаут - сбрасывать ничего не нужно.
      `,
    );
  });

  bot.command("cancel", async (ctx) => {
    log.debug(JSON.stringify(ctx.scene.current));
    ctx.scene.leave();
  });

  await initSchedule(bot);
  await initOptions(bot);

  bot.command("config", async (ctx) => {
    const [cmd, ...args] = ctx.message.text.trim().split(" ");
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user)
      return ctx.reply(
        "Вас не существует в базе данных. Пожалуйста пропишите /start",
      );
    const preferences = Object.assign(
      {},
      UserPreferencesDefaults,
      user.preferences,
    );
    if (args.length === 0) {
      return ctx.reply(
        `Текущие параметры:\n${JSON.stringify(Object.assign({}, preferences, { subgroup: user.subgroup }), null, 2)}`,
      );
    }
    const field = args.shift()!.toLowerCase();
    if (field === "theme") {
      const themes = Object.keys(STYLEMAPS);
      const target = args[0];
      if (!target) {
        return ctx.reply(`Доступные темы: ${themes.join(", ")}`);
      } else if (!themes.includes(target)) {
        return ctx.reply(
          `Такой темы нет.\nДоступные темы: ${themes.join(", ")}`,
        );
      }
      preferences.theme = target;
      await db.user.update({ where: { id: user.id }, data: { preferences } });
      if (ctx.session.scheduleViewer.message)
        sendTimetable(ctx, ctx.session.scheduleViewer.week);
      return ctx.reply(`Тема успешно изменена на '${target}'`);
    } else if (field === "subgroup") {
      const arg = args[0]?.trim();
      const target = isNaN(arg as any) ? null : Number(arg);
      if (!arg || target === null || target < 0 || target > 2) {
        return ctx.reply(
          `Вы можете установить себе подгруппу 1 или 2.\nПодгруппа 0 - обе\nВаша подгруппа: ${user.subgroup ?? 0}`,
        );
      }
      const now = new Date();
      await db.user.update({
        where: { id: user.id },
        data: {
          subgroup: target,
          ics: {
            upsert: {
              create: { validUntil: now },
              update: { validUntil: now },
            },
          },
        },
      });
      await db.week.updateMany({
        where: { owner: user.id },
        data: { cachedUntil: now },
      });
      ctx.reply(`Подгруппа успешно изменена на ${target}`);
    }
  });

  bot.command("invalidate", async (ctx) => {
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
      ctx.reply(
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
    ctx.reply(
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
    ctx.reply(
      `${replyHeader}${text}\n---\nБыло поставлено в очередь на отправку`,
      { entities },
    );
  });

  bot.on(message("text"), async (ctx) => {
    log.debug(`[ignored: message fell]`, { user: ctx.from.id });
  });

  // bot.on(message("photo"), async (ctx) => {
  //   ctx.session.messages.push({ photo: ctx.message });
  // });

  // bot.on(message("video"), async (ctx) => {
  //   ctx.session.messages.push({ video: ctx.message });
  // });
}

export const bot = new Telegraf<Context>(env.SCHED_BOT_TOKEN);

async function init(fastify: FastifyInstance) {
  const TOKEN = env.SCHED_BOT_TOKEN;

  await fastify.register(
    fp<{ token: string }>(
      async (fastify) => {
        log.debug("Registering bot..");

        bot.use(
          session({
            defaultSession: getDefaultSession,
          }),
        );

        await init_bot(bot);

        fastify.decorate("bot", bot);
      },
      {
        name: "arais-sched-bot",
      },
    ),
    {
      token: TOKEN,
    },
  );

  return fastify;
}

declare module "fastify" {
  interface FastifyInstance {
    bot: Telegraf<Context>;
  }
}

export default init;
