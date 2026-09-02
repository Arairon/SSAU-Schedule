import { Bot as GrammyBot, InputFile, type GrammyError, session } from "grammy"
import { run } from "@grammyjs/runner"
import { conversations } from "@grammyjs/conversations"

import { env } from "@/bot/env"
import { type Context, type Session } from "./types"
import log from "@/bot/logger"

import { initSchedule, scheduleCommands } from "./schedule"
import { initOptions, optionsCommands } from "./options"
import { initFeedback, feedbackCommands } from "./feedback"
import { initAdmin } from "./admin"
import { configCommands, initConfig } from "./config"
import { initLogin } from "./conversations/login"
import { initGroupChange } from "./conversations/groupChange"
import { initOnboarding } from "./conversations/onboarding"
import { accountCommands, initAccount } from "./account"
import { type BotCommand } from "grammy/types"

import type { Update } from "grammy/types"
import { getVersionString } from "@ssau-schedule/shared/version"

function createBot(): GrammyBot<Context> {
  return new GrammyBot<Context>(env.SCHED_BOT_TOKEN)
}

export function getDefaultSession(): Session {
  return {
    sceneData: {},
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
      teacherId: undefined,
      mode: null,
    },
    nerdMode: false,
  }
}

async function sendErrorMessage(ctx: Context, comment?: string) {
  try {
    return ctx.reply(
      `Что-то пошло не так. Если это повторится - свяжитесь с ${env.SCHED_BOT_ADMIN_CONTACT}.\n${comment ?? ""}`,
    )
  } catch {
    log.error("Error occured during sendErrorMessage. Ignoring.", {
      user: ctx?.from?.id ?? ctx.chat?.id ?? "unknown",
    })
  }
}

export async function handleError(ctx: Context, error: Error) {
  void sendErrorMessage(ctx)
  log.error(`Bot threw an error`, {
    user: ctx?.from?.id ?? ctx.chat?.id ?? "unknown",
    object: error
  })
  if (env.NODE_ENV === "development") throw error
}

async function initBot(bot: GrammyBot<Context>) {
  bot.use(
    session({
      initial: getDefaultSession,
    }),
  )

  bot.use(conversations())

  setTimeout(() => {
    if (env.SCHED_BOT_ADMIN_TGID && env.NODE_ENV === "production") {
      try {
        void bot.api.sendMessage(
          env.SCHED_BOT_ADMIN_TGID,
          `\
Бот запущен!
Если вы видите это не в момент запуска, то значит сервер крашнулся :D
Версия: ${getVersionString({ format: "long" })}\
          `,
        )
      } catch {
        log.error("Failed to notify admin about bot start")
      }
    }
  }, 3000)

  bot.use((ctx: Context, next) => {
    const convos = ctx.conversation.active()
    if (Object.keys(convos).length > 0) {
      return next()
    }
    if (ctx.message && "text" in ctx.message) {
      log.debug(`${ctx.message.text}`, {
        user: ctx?.from?.id ?? -1
      })
    } else if (ctx.callbackQuery) {
      log.debug(`<cb> ${ctx.callbackQuery.data}`, {
        user: ctx?.from?.id ?? -1,
      })
    }
    return next()
  })

  if (env.NODE_ENV === "production") {
    bot.catch((err) => {
      const ctx = err.ctx
      const error = err.error
      log.error(
        `[BOT] Error: ${err.name}`,
        {
          user: ctx?.from?.id ?? -1,
          object: err,
        },
      )
      return ctx.api.sendMessage(
        `${env.SCHED_BOT_ADMIN_TGID}`,
        `Бот словил еррор в диалоге ${ctx.chat?.id}:${ctx.from?.id}:${ctx.from?.username}: ${JSON.stringify(error)}\n${err.name}\n${err.stack ?? "Stack unavailable"}`,
      )
    })
  }

  await initLogin(bot)
  await initGroupChange(bot)
  await initOnboarding(bot)

  await initAccount(bot)
  await initSchedule(bot)
  await initOptions(bot)
  await initConfig(bot)
  await initAdmin(bot)
  await initFeedback(bot)

  const publicCommands = ["schedule", "options", "today", "now", "ics", "exams", "bug"]
  const commands: BotCommand[] = []
  for (const commandGroup of [
    accountCommands,
    scheduleCommands,
    optionsCommands,
    configCommands,
    feedbackCommands,
  ]) {
    for (const command of commandGroup.commands) {
      if (publicCommands.includes(command.stringName))
        commands.push({
          command: command.stringName,
          description: command.description,
        })
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
    bot.api.setMyCommands(commands, {
      scope: { type: "all_private_chats" },
    }),
  ])
    .then(() => {
      log.info("Bot commands set", { tag: "init", user: "bot" })
    })
    .catch((err) => {
      log.error(`Failed to set bot commands: ${JSON.stringify(err)}`, {
        tag: "init",
        user: "bot",
      })
    })
  // Too lazy to use proper groups. Unsure how to separate them and where to switch the user between them

  bot.on("message:text", async (ctx) => {
    log.debug(`[chat] (${ctx.from.username ?? "N/A"}): ${ctx.message.text}`, {
      user: ctx.from.id,
    })
  })

}

export const bot = createBot()

let initializationPromise: Promise<void> | null = null
let shutdownHookRegistered = false

function getWebhookUrl(path: string): string {
  if (env.SCHED_BOT_WEBHOOK_URL) return env.SCHED_BOT_WEBHOOK_URL
  return `https://${env.SCHED_BOT_DOMAIN}${path}`
}

async function resolveTlsMaterial(input: string): Promise<Uint8Array> {
  const trimmed = input.trimStart()
  if (trimmed.startsWith("-----BEGIN")) {
    return new TextEncoder().encode(input)
  }

  return new Uint8Array(await Bun.file(input).arrayBuffer())
}

async function ensureInitialized() {
  if (initializationPromise) {
    await initializationPromise
    return
  }

  initializationPromise = (async () => {
    log.debug("Registering bot..", { tag: "init", user: "bot" })

    await initBot(bot)

    if (env.SCHED_BOT_USE_WEBHOOK) {
      const webhookUrl = getWebhookUrl(env.SCHED_BOT_WEBHOOK_PATH)
      const webhookOptions: Parameters<typeof bot.api.setWebhook>[1] = {}

      if (env.SCHED_BOT_WEBHOOK_SECRET) {
        webhookOptions.secret_token = env.SCHED_BOT_WEBHOOK_SECRET
      }

      if (env.SCHED_BOT_TLS_CERT && env.SCHED_BOT_TLS_KEY) {
        const certContent = await resolveTlsMaterial(env.SCHED_BOT_TLS_CERT)

        webhookOptions.certificate = new InputFile(
          certContent,
          "webhook-cert.pem",
        )
      }

      await bot.api
        .setWebhook(webhookUrl, webhookOptions)
        .catch((err: GrammyError) => {
          if (err.error_code === 429) {
            log.warn(`Failed to set webhook: Too Many Requests.`, {
              tag: "init",
              user: "bot",
            })
          }
        })

      await bot.init()

      log.info(`Bot started in webhook mode: ${webhookUrl}`, {
        tag: "init",
        user: "bot",
      })
    } else {
      await bot.api.deleteWebhook()

      const runnerHandle = run(bot)

      log.info("Bot started in long-polling mode", {
        tag: "init",
        user: "bot",
      })

      if (!shutdownHookRegistered) {
        shutdownHookRegistered = true

        process.once("SIGINT", () => {
          log.info("Received SIGINT, shutting down...")
          void runnerHandle.stop()
          setTimeout(() => {
            log.error("Failed to terminate in time, forcing exit")
            process.exit(1)
          }, 5000)
        })

        process.once("SIGTERM", () => {
          log.info("Received SIGTERM, shutting down...")
          void runnerHandle.stop()
          setTimeout(() => {
            log.error("Failed to terminate in time, forcing exit")
            process.exit(1)
          }, 5000)
        })
      }
    }

    if (env.SCHED_BOT_USE_WEBHOOK && !shutdownHookRegistered) {
      shutdownHookRegistered = true

      process.once("SIGINT", () => {
        log.info("Received SIGINT, deleting webhook...")
        void bot.api
          .deleteWebhook()
          .then(() => process.exit(0))
          .catch(() => process.exit(1))
        setTimeout(() => {
          log.error("Failed to delete webhook in time, forcing exit")
          process.exit(1)
        }, 5000)
      })

      process.once("SIGTERM", () => {
        log.info("Received SIGTERM, deleting webhook...")
        void bot.api
          .deleteWebhook()
          .then(() => process.exit(0))
          .catch(() => process.exit(1))
        setTimeout(() => {
          log.error("Failed to delete webhook in time, forcing exit")
          process.exit(1)
        }, 5000)
      })
    }

    log.debug("Bot registered", { tag: "init", user: "bot" })
  })()

  try {
    await initializationPromise
  } catch (error) {
    initializationPromise = null
    throw error
  }
}

export async function handleWebhookUpdate(update: Update) {
  await ensureInitialized()
  console.log("Handling webhook update:", JSON.stringify(update))
  await bot.handleUpdate(update)
  console.log("done")
}

async function init() {
  await ensureInitialized()
}

export default init
