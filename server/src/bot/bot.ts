import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { Markup, Scenes, session, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { bold, fmt } from "telegraf/format";

import { env } from "../env";
import { type Context, type Session } from "./types";
import log from "../logger";
import { db } from "../db";
import { lk } from "../lib/lk";
import { getPersonShortname } from "../lib/utils";
import { loginScene } from "./scenes/login";

import { initSchedule } from "./schedule";
import { initOptions } from "./options";
import { initAdmin } from "./admin";

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
  return ctx.reply(fmt`
Добро пожаловать!
Этот бот создан в первую очередь для работы для работы с личным кабинетом самарского университета.
Возможность делать анонимные запросы возможно будет добавлена позже.
Для начала потребуется войти в личный кабинет. Вы можете это сделать по команде /login
Каковы гарантии что я не украду ваш аккаунт лк? Никаких :)
Ну а если серьёзно, то зачем оно мне надо...
    `);
}

const stage = new Scenes.Stage([loginScene]);

async function sendErrorMessage(ctx: Context, comment?: string) {
  try {
    return ctx.reply(
      `Что-то пошло не так. Свяжитесь с ${env.SCHED_BOT_ADMIN_CONTACT}.\n${comment ?? ""}`,
    );
  } catch {
    log.error("Error occured during sendErrorMessage. Ignoring.", {
      user: ctx?.from?.id ?? ctx.chat?.id ?? "unknown",
    });
  }
}

export async function handleError(ctx: Context, error: Error) {
  void sendErrorMessage(ctx);
  log.error(`Bot threw an error: E: ${JSON.stringify(error)}`, {
    user: ctx?.from?.id ?? ctx.chat?.id ?? "unknown",
  });
  if (env.NODE_ENV === "development") throw error;
}

//TODO: Ensure commands are guarded against non logged in users or fall them back to 'common'
async function init_bot(bot: Telegraf<Context>) {
  void bot.launch(() => {
    log.info("Bot started!");
    if (env.SCHED_BOT_ADMIN_TGID && env.NODE_ENV === "production") {
      try {
        void bot.telegram.sendMessage(env.SCHED_BOT_ADMIN_TGID, "Bot started!");
      } catch {
        log.error("Failed to notify admin about bot start");
      }
    }
  });

  bot.use(stage.middleware());

  bot.use((ctx: Context, next) => {
    if (ctx.message && "text" in ctx.message)
      log.debug(`${ctx.message.text}`, { user: ctx?.from?.id ?? -1 });
    return next();
  });

  bot.catch((err, ctx) => {
    return handleError(ctx, err as Error);
  });

  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const existingUser = await db.user.findUnique({
      where: { tgId: ctx.from.id },
    });
    if (!existingUser) {
      return start(ctx, userId);
    } else {
      return ctx.reply(
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
      void ctx.deleteMessage(ctx.callbackQuery.message?.message_id);
    await ctx.answerCbQuery();
  });

  bot.action("start_reset_confirm", async (ctx) => {
    log.debug("start_reset_confirm", { user: ctx.from.id });
    if (ctx.callbackQuery.message?.message_id)
      void ctx.deleteMessage(ctx.callbackQuery.message?.message_id);
    await ctx.answerCbQuery();
    return reset(ctx, ctx.from.id).then(() => start(ctx, ctx.from.id));
  });

  bot.command("login", async (ctx) => {
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (user) {
      ctx.session.loggedIn = true;
      if (user.username && user.password) {
        await ctx.reply(fmt`
Вы уже вошли как '${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")} (${user.username})'.
Если вы хотите выйти - используйте /logout
      `);
        return;
      }
      if (user.authCookie && user.sessionExpiresAt > new Date()) {
        await ctx.reply(fmt`
Ваша сессия как '${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")}' всё ещё активна.
Если вы хотите её прервать, используйте /logout
      `);
        return;
      }
    }
    void ctx.deleteMessage(ctx.message.message_id);
    return ctx.scene.enter("LK_LOGIN");
  });

  bot.command("logout", async (ctx) => {
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(
        "Вас не существует в базе данных. Пожалуйста пропишите /start",
      );
    }
    const hadCredentials = user.username && user.password;
    await lk.resetAuth(user, { resetCredentials: true });
    return ctx.reply(
      fmt`
Сессия завершена. ${hadCredentials ? "Данные для входа удалены." : ""}
Внимание: Если вы собираетесь в будующем входить в ${bold("другой")} аккаунт ссау, то вам следует сбросить данные о себе через /start
Если же вы собираетесь продолжать использовать текущий аккаут - сбрасывать ничего не нужно.
      `,
    );
  });

  bot.command("cancel", async (ctx) => {
    log.debug(JSON.stringify(ctx.scene.current));
    return ctx.scene.leave();
  });

  await initSchedule(bot);
  await initOptions(bot);
  await initAdmin(bot);

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
