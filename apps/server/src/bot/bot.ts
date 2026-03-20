import { Bot as GrammyBot, session } from "grammy";
import { run } from "@grammyjs/runner";
import { conversations } from "@grammyjs/conversations";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

import { env } from "@/env";
import { type Context, type Session } from "./types";
import log from "@/logger";

import { initSchedule, scheduleCommands } from "./schedule";
import { initOptions, optionsCommands } from "./options";
import { initAdmin } from "./admin";
import { configCommands, initConfig } from "./config";
import { initLogin } from "./conversations/login";
import { initGroupChange } from "./conversations/groupChange";
import { initOnboarding } from "./conversations/onboarding";
import { accountCommands, initAccount } from "./account";
import { type BotCommand } from "grammy/types";

// function getWebhookUrl(path: string): string {
//   if (env.SCHED_BOT_WEBHOOK_URL) return env.SCHED_BOT_WEBHOOK_URL;
//   return `https://${env.SCHED_BOT_DOMAIN}${path}`;
// }

function resolveProxyKind(proxyUrl: URL): "socks" | "https" {
  const protocol = proxyUrl.protocol.replace(":", "").toLowerCase();
  const configuredType = env.SCHED_BOT_PROXY_TYPE;

  if (configuredType === "socks") {
    if (!protocol.startsWith("socks")) {
      throw new Error(
        "SCHED_BOT_PROXY_TYPE=socks requires a socks:// proxy URL",
      );
    }
    return "socks";
  }

  if (configuredType === "https") {
    if (!["http", "https"].includes(protocol)) {
      throw new Error(
        "SCHED_BOT_PROXY_TYPE=https requires a http:// or https:// proxy URL",
      );
    }
    return "https";
  }

  if (protocol.startsWith("socks")) return "socks";
  if (["http", "https"].includes(protocol)) return "https";

  throw new Error(
    `Unsupported SCHED_BOT_PROXY_URL protocol: ${proxyUrl.protocol}`,
  );
}

function createBot(): GrammyBot<Context> {
  if (!env.SCHED_BOT_PROXY_URL) {
    return new GrammyBot<Context>(env.SCHED_BOT_TOKEN);
  }

  const proxyUrl = new URL(env.SCHED_BOT_PROXY_URL);
  const proxyKind = resolveProxyKind(proxyUrl);
  const proxyAgent =
    proxyKind === "socks"
      ? new SocksProxyAgent(proxyUrl)
      : new HttpsProxyAgent(proxyUrl);

  log.info(`Telegram API proxy enabled (${proxyUrl})`, {
    user: "sys",
  });

  return new GrammyBot<Context>(env.SCHED_BOT_TOKEN, {
    client: {
      baseFetchConfig: {
        agent: proxyAgent,
        compress: true,
      },
    },
  });
}

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
    startedScheduleUpdateAt: null,
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
  await initGroupChange(bot);
  await initOnboarding(bot);

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

  const hiddenCommands = ["config", "logout", "login", "start", "app"]; // and the whole admin group
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
  void Promise.all([
    bot.api.setMyCommands(
      [
        { command: "options", description: "Настройки" },
        { command: "schedule", description: "Расписание" },
      ],
      { scope: { type: "all_group_chats" } },
    ),
    bot.api.setMyCommands(publicCommands, {
      scope: { type: "all_private_chats" },
    }),
  ]).then(() => {
    log.info("Bot commands set", { user: "sys" });
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

export const bot = createBot();

async function init() {
  log.debug("Registering bot..", { tag: "init", user: "bot" });

  await initBot(bot);

  if (env.SCHED_BOT_USE_WEBHOOK) {
    throw new Error("Webhook mode is not yet supported.");
  } else {
    await bot.api.deleteWebhook();

    const runnerHandle = run(bot);

    log.info("Bot started in long-polling mode", { tag: "init", user: "bot" });

    process.once("SIGINT", () => {
      log.info("Received SIGINT, shutting down...");
      void runnerHandle.stop();
    });

    process.once("SIGTERM", () => {
      log.info("Received SIGTERM, shutting down...");
      void runnerHandle.stop();
    });
  }
  log.debug("Bot registered", { tag: "init", user: "bot" });
}

// async function initFastify(fastify: FastifyInstance) {
//   const TOKEN = env.SCHED_BOT_TOKEN;

//   await fastify.register(
//     fp<{ token: string }>(
//       async (fastify) => {
//         log.debug("Registering bot..");

//         await initBot(bot);

//         let handle: BotHandle;
//         if (env.SCHED_BOT_USE_WEBHOOK) {
//           const webhookPath = getWebhookPath();
//           const webhookUrl = getWebhookUrl(webhookPath);
//           const webhookHandler = webhookCallback(bot, "fastify", {
//             onTimeout: "return",
//             timeoutMilliseconds: 9000,
//             secretToken: env.SCHED_BOT_WEBHOOK_SECRET,
//           });

//           fastify.post(webhookPath, async (request, reply) => {
//             log.debug("Received webhook update");
//             await webhookHandler(request, reply);
//             log.debug("Handled webhook update");
//           });

//           await bot.api.setWebhook(
//             webhookUrl,
//             env.SCHED_BOT_WEBHOOK_SECRET
//               ? { secret_token: env.SCHED_BOT_WEBHOOK_SECRET }
//               : undefined,
//           );

//           await bot.init();

//           handle = {
//             stop: async () => {
//               await bot.api.deleteWebhook();
//             },
//           };

//           log.info(`Bot started in webhook mode: ${webhookUrl}`);
//         } else {
//           await bot.api.deleteWebhook();

//           const runnerHandle: RunnerHandle = run(bot);
//           handle = {
//             stop: () => runnerHandle.stop(),
//           };
//           log.info("Bot started in long-polling mode");
//         }

//         log.debug("Bot registered");

//         fastify.decorate("bot", bot);
//         fastify.decorate("botHandle", handle);
//       },
//       {
//         name: "arais-sched-bot",
//       },
//     ),
//     {
//       token: TOKEN,
//     },
//   );

//   return fastify;
// }

// declare module "fastify" {
//   interface FastifyInstance {
//     bot: GrammyBot<Context>;
//     botHandle: BotHandle;
//   }
// }

export default init;
