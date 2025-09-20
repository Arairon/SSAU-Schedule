import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { Bot as GrammyBot, session, InlineKeyboard } from "grammy";
import { run, type RunnerHandle } from "@grammyjs/runner";
import { conversations } from "@grammyjs/conversations";

import { env } from "../env";
import { type Context, type Session } from "./types";
import log from "../logger";
import { db } from "../db";
import { lk } from "../lib/lk";
import { getPersonShortname } from "../lib/utils";
// import { loginScene } from "./scenes/login";

import { initSchedule } from "./schedule";
import { initOptions } from "./options";
import { initAdmin } from "./admin";
import { initConfig } from "./config";
import { initLogin } from "./conversations/login";

function getDefaultSession(): Session {
  return {
    sceneData: {},
    loggedIn: false,
    options: {
      message: 0,
      menu: "",
      updText: null,
    },
    runningScheduleUpdate: false,
    scheduleViewer: {
      message: 0,
      chatId: 0,
      week: 0,
      groupId: undefined,
    },
  };
}

async function reset(ctx: Context, userId: number) {
  await db.user.delete({ where: { tgId: userId } });
}

async function start(ctx: Context, userId: number) {
  await db.user.create({ data: { tgId: userId } });
  Object.assign(ctx.session, getDefaultSession());
  return ctx.reply(
    `\
Добро пожаловать!
Этот бот создан в первую очередь для работы для работы с личным кабинетом самарского университета.
Возможность делать анонимные запросы возможно будет добавлена позже.
Для начала потребуется войти в личный кабинет. Вы можете это сделать по команде /login
Каковы гарантии что я не украду ваш аккаунт лк? Никаких :)
Ну а если серьёзно, то зачем оно мне надо...

Внимание: Расписания "на холодную" могут отправляться по 5-10 секунд.
Расписания подгружаются ежедневно в час ночи, чтобы это компенсировать, однако подгружаются они только для текущих настроек, так что при смене настрое может снова потребоваться генерировать новые изображения

Исходный код: https://github.com/arairon/ssau-schedule
Администратор бота: ${env.SCHED_BOT_ADMIN_CONTACT}
Автор бота: @arairon
    `,
    { link_preview_options: { is_disabled: true } },
  );
}

async function sendErrorMessage(ctx: Context, comment?: string) {
  try {
    return ctx.reply(
      `Что-то пошло не так. Если это повторится - свяжитесь с ${env.SCHED_BOT_ADMIN_CONTACT}.\n${comment ?? ""}`,
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
async function initBot(bot: GrammyBot<Context>) {
  bot.use(
    session({
      initial: getDefaultSession,
    }),
  );

  bot.use(conversations());

  setTimeout(() => {
    if (env.SCHED_BOT_ADMIN_TGID && env.NODE_ENV === "production") {
      try {
        void bot.api.sendMessage(
          env.SCHED_BOT_ADMIN_TGID,
          "Бот запущен!\nЕсли вы видите это не в момент запуска, то значит я крашнулся :D",
        );
      } catch {
        log.error("Failed to notify admin about bot start");
      }
    }
  }, 3000);

  //bot.use(stage.middleware());

  await initLogin(bot);

  bot.use((ctx: Context, next) => {
    if (
      ctx.message &&
      "text" in ctx.message &&
      !ctx.conversation.active().LK_LOGIN
    )
      log.debug(`${ctx.message.text}`, { user: ctx?.from?.id ?? -1 });
    return next();
  });

  if (env.NODE_ENV === "production") {
    bot.catch((err) => {
      const ctx = err.ctx;
      const error = err.error;
      log.error(`[BOT] ${JSON.stringify(error)}`, {
        user: ctx?.from?.id ?? -1,
      });
      return ctx.api.sendMessage(
        `${env.SCHED_BOT_ADMIN_TGID}`,
        `Бот словил еррор в диалоге ${ctx.chat?.id}:${ctx.from?.id}: ${JSON.stringify(error)}`,
      );
    });
  }

  await initSchedule(bot);
  await initOptions(bot);
  await initConfig(bot); // The /config command
  await initAdmin(bot);

  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const userId = ctx.from?.id;
    if (!userId) {
      return ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
        parse_mode: "HTML",
      });
    }
    const existingUser = await db.user.findUnique({
      where: { tgId: userId },
    });
    if (!existingUser) {
      return start(ctx, userId);
    } else {
      return ctx.reply(
        `\
Вы уверены что хотите сбросить все настройки?
Будет сброшено всё: Календари, настроки, данные для входа, группы и т.п.
        `,
        {
          reply_markup: new InlineKeyboard()
            .text("Отмена", "start_reset_cancel")
            .text("Да, сбросить", "start_reset_confirm"),
        },
      );
    }
  });

  bot.callbackQuery("start_reset_cancel", async (ctx) => {
    log.debug("start_reset_cancel", { user: ctx.from.id });
    if (ctx.callbackQuery.message?.message_id)
      void ctx.api.deleteMessage(
        ctx.from.id,
        ctx.callbackQuery.message?.message_id,
      );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("start_reset_confirm", async (ctx) => {
    log.debug("start_reset_confirm", { user: ctx.from.id });
    if (ctx.callbackQuery.message?.message_id)
      void ctx.api.deleteMessage(
        ctx.from.id,
        ctx.callbackQuery.message?.message_id,
      );
    await ctx.answerCallbackQuery();
    return reset(ctx, ctx.from.id).then(() => start(ctx, ctx.from.id));
  });

  bot.command("login", async (ctx) => {
    if (!ctx.from) return;
    if (ctx.chat.type !== "private") return;
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (user) {
      ctx.session.loggedIn = true;
      if (user.username && user.password) {
        await ctx.reply(`
Вы уже вошли как '${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")} (${user.username})'.
Если вы хотите выйти - используйте /logout
      `);
        return;
      }
      if (user.authCookie && user.sessionExpiresAt > new Date()) {
        await ctx.reply(`
Ваша сессия как '${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")}' всё ещё активна.
Если вы хотите её прервать, используйте /logout
      `);
        return;
      }
    }
    return ctx.conversation.enter("LK_LOGIN");
    //void ctx.deleteMessage(ctx.message.message_id);
    //return ctx.scene.enter("LK_LOGIN");
  });

  bot.command("logout", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (!ctx.from) {
      return ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
        parse_mode: "HTML",
      });
    }
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(
        "Вас не существует в базе данных. Пожалуйста пропишите /start",
      );
    }
    const hadCredentials = user.username && user.password;
    await lk.resetAuth(user, { resetCredentials: true });
    return ctx.reply(
      `
Сессия завершена. ${hadCredentials ? "Данные для входа удалены." : ""}
Внимание: Если вы собираетесь в будующем входить в <b>другой</b> аккаунт ссау, то вам следует сбросить данные о себе через /start
Если же вы собираетесь продолжать использовать текущий аккаунт - сбрасывать ничего не нужно.
      `,
      { parse_mode: "HTML" },
    );
  });

  bot.command("ics", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (!ctx.from) {
      return ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
        parse_mode: "HTML",
      });
    }
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(
        "Вас не существует в базе данных. Пожалуйста пропишите /start",
      );
    }
    return ctx.reply(
      `\
Инструкция по установке: https://l9labs.ru/stud_bot/ics.html
(Украдено у l9 :D)

Ваша ссылка:
https://${env.SCHED_BOT_DOMAIN}/api/user/${user.id}/ics

‼️Файл по этой ссылке не для скачивания‼️
Содержимое ссылки генерируется динамически в зависимости от текущего расписания и ваших настроек.
Добавьте её в календарь и включите синхронизацию.
 `,
      { link_preview_options: { is_disabled: true } },
    );
  });

  bot.command("help", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (!ctx.from) {
      return ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
        parse_mode: "HTML",
      });
    }
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user?.authCookie)
      return ctx.reply(
        `\
Добро пожаловать!
Этот бот создан в первую очередь для работы для работы с личным кабинетом самарского университета.
Возможность делать анонимные запросы возможно будет добавлена позже.

Для начала потребуется войти в личный кабинет. Вы можете это сделать по команде /login
Сохранять данные для входа не обязательно. Бот использует куки для поддержания сессии, но если она слетит - бот сможет воспользоваться данными для входа, если они есть.

Внимание: Расписания "на холодную" могут отправляться по 5-10 секунд.
Расписания подгружаются ежедневно в час ночи, чтобы это компенсировать, однако подгружаются они только для текущих настроек, так что при смене настрое может снова потребоваться генерировать новые изображения

Исходный код: https://github.com/Arairon/SSAU-Schedule
Администратор бота: ${env.SCHED_BOT_ADMIN_CONTACT}
Автор бота: @arairon
`,
        { link_preview_options: { is_disabled: true } },
      );
    return ctx.reply(
      `\
Добро пожаловать, ${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")}!

Вы можете запросить своё расписание по команде /schedule [номер недели?] (по умолчанию текущая неделя)
Или расписание конкретной группа (игнорируя настройки) /schedule [группа] [номер недели?]
Так же можно запросить неделю просто введя её номер в чат.
Для запроса расписания группы просто введите её номер (например "6101-090301D" или частично "6101" для поиска)
Вы можете запросить ссылку на ICS календарь по команде /ics
Вы можете изменить настройки по команде /options
Если вы хотите выйти из аккаунта - используйте /logout
Если вы хотите сбросить все данные о себе - используйте /start

Внимание: Расписания "на холодную" могут отправляться по 5-10 секунд.
Расписания подгружаются ежедневно в час ночи на 8 недель чтобы это компенсировать, однако подгружаются они только для текущих настроек, так что при смене настрое может снова потребоваться генерировать новые изображения

Исходный код: https://github.com/Arairon/SSAU-Schedule
Администратор бота: ${env.SCHED_BOT_ADMIN_CONTACT}
Автор бота: @arairon
`,
      { link_preview_options: { is_disabled: true } },
    );
  });

  bot.on("message:text", async (ctx) => {
    log.debug(`[chat] (${ctx.from.username ?? "N/A"}): ${ctx.message.text}`, {
      user: ctx.from.id,
    });
  });

  // bot.on(message("photo"), async (ctx) => {
  //   ctx.session.messages.push({ photo: ctx.message });
  // });

  // bot.on(message("video"), async (ctx) => {
  //   ctx.session.messages.push({ video: ctx.message });
  // });
}

export const bot = new GrammyBot<Context>(env.SCHED_BOT_TOKEN);

async function init(fastify: FastifyInstance) {
  const TOKEN = env.SCHED_BOT_TOKEN;

  await fastify.register(
    fp<{ token: string }>(
      async (fastify) => {
        log.debug("Registering bot..");

        await initBot(bot);
        const handle = run(bot);

        log.debug("Bot registered");

        fastify.decorate("bot", bot);
        fastify.decorate("botHandle", handle);
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
    bot: GrammyBot<Context>;
    botHandle: RunnerHandle;
  }
}

export default init;
