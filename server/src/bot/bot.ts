import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { Bot as GrammyBot, session } from "grammy";
import { run, type RunnerHandle } from "@grammyjs/runner";
import { conversations } from "@grammyjs/conversations";

import { env } from "../env";
import { type Context, type Session } from "./types";
import log from "../logger";

import { initSchedule, scheduleCommands } from "./schedule";
import { initOptions, optionsCommands } from "./options";
import { initAdmin } from "./admin";
import { configCommands, initConfig } from "./config";
import { initLogin } from "./conversations/login";
import { accountCommands, initAccount } from "./account";
import { type BotCommand } from "grammy/types";

export function getDefaultSession(): Session {
  return {
    sceneData: {},
    loggedIn: false,
    options: {
      message: 0,
      menu: "",
      updText: null,
      notificationsRescheduleTimeout: null,
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

  // Do not place before initLogin. Otherwise it will log user's credentials.
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
      log.error(
        `[BOT] ${JSON.stringify(err)}\n${err.name}\n${err.stack ?? "Stack unavailable"}`,
        {
          user: ctx?.from?.id ?? -1,
        },
      );
      return ctx.api.sendMessage(
        `${env.SCHED_BOT_ADMIN_TGID}`,
        `Бот словил еррор в диалоге ${ctx.chat?.id}:${ctx.from?.id}:${ctx.from?.username}: ${JSON.stringify(error)}\n${err.name}\n${err.stack ?? "Stack unavailable"}`,
      );
    });
  }

  await initAccount(bot);
  await initSchedule(bot);
  await initOptions(bot);
  await initConfig(bot);
  await initAdmin(bot);

  const hiddenCommands = ["config", "logout", "login", "start"]; // and the whole admin group
  const publicCommands: BotCommand[] = [];
  for (const commandGroup of [
    accountCommands,
    scheduleCommands,
    optionsCommands,
    configCommands,
  ]) {
    for (const command of commandGroup.commands) {
      if (hiddenCommands.includes(command.stringName)) continue;
      publicCommands.push({
        command: command.stringName,
        description: command.description,
      });
    }
  }
  void bot.api.setMyCommands(
    [
      { command: "options", description: "Настройки" },
      { command: "schedule", description: "Расписание" },
    ],
    { scope: { type: "all_group_chats" } },
  );
  void bot.api.setMyCommands(publicCommands, {
    scope: { type: "all_private_chats" },
  });
  // Too lazy to use proper groups. Unsure how to separate them and where to switch the user between them

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
