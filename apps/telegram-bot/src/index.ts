import { Elysia } from "elysia";

import { env } from "@/env";
import log from "@/logger";

import init_bot, { handleWebhookUpdate } from "@/bot";
import { apiApp } from "./api";
import cors from "@elysiajs/cors";
import { api } from "./serverClient";
import type { Update } from "grammy/types";

let requestIdCounter = 0;

const app = new Elysia()
  // .use(openapi())
  .use(
    cors({
      credentials: true,
    }),
  )
  .onRequest(({ request, set }) => {
    requestIdCounter += 1;
    set.headers["x-request-id"] = requestIdCounter.toString();
    set.headers["x-request-time"] = Date.now().toString();
    const path = new URL(request.url).pathname;
    log.debug(`<- ${request.method.padEnd(5, " ")} ${path}`, {
      user: requestIdCounter,
      tag: "Ely",
    });
  })
  .onAfterResponse(async ({ request, set }) => {
    const requestId = set.headers["x-request-id"];
    const requestStart = Number(set.headers["x-request-time"]);
    const requestTime = Date.now() - requestStart;
    const path = new URL(request.url).pathname;
    log.debug(
      `-> ${request.method[0]} ${set.status ?? "unk"} ${path} – ${requestTime}ms`,
      {
        user: requestId,
        tag: "Ely",
      },
    );
  })
  .get("/ok", () => "ok")
  .use(apiApp);

export type ScheduleTelegramBotApp = typeof app;

function init_bot_webhook() {
  app.post(env.SCHED_BOT_WEBHOOK_PATH, async ({ body, headers, set }) => {
    if (!env.SCHED_BOT_USE_WEBHOOK) {
      set.status = 404;
      return "Webhook mode is disabled";
    }

    if (env.SCHED_BOT_WEBHOOK_SECRET) {
      const headerSecret = headers["x-telegram-bot-api-secret-token"];
      if (headerSecret !== env.SCHED_BOT_WEBHOOK_SECRET) {
        log.warn(`Unauthorized request to webhook: invalid secret`, {
          tag: "Ely",
          user: "tg",
        });
        set.status = 401;
        return "Unauthorized";
      }
    }

    await handleWebhookUpdate(body as Update);
    return "ok";
  });
}

async function start() {
  app.listen(env.SCHED_BOT_PORT, () => {
    log.info(
      `Elysia server started at ${app.server?.hostname}:${app.server?.port}`,
      { tag: "Ely", user: 0 },
    );
  });

  init_bot_webhook();
  void init_bot();
  void connectionCheck();
}

async function connectionCheck() {
  let success = false;
  while (!success) {
    let e: Error | null = null;
    await api.health
      .get({
        headers: {
          "x-internal-api-secret": env.SCHED_SERVER_INTERNAL_API_SECRET,
        },
      })
      .then((res) => {
        success = res.data === "ok";
      })
      .catch((err: Error) => {
        e = err;
      });

    if (!success) {
      log.warn(
        "Unable to connect to schedule server" +
          (e ? ": " + JSON.stringify(e) : ""),
        {
          user: "init",
          tag: "Ely",
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  log.info("Successfully connected to schedule server", {
    user: "init",
    tag: "Ely",
  });
}

void start();
