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
      tag: "API",
    });
  })
  .onError(({ request, error, set, path }) => {
    const requestId = set.headers["x-request-id"];
    const e = {
      status: "status" in error ? error.status : "000",
      code: "code" in error ? error.code : "unknown",
    };
    log.error(
      `XX ${request.method.padEnd(5, " ")} ${path} - ${e.status}: ${e.code}`,
      {
        user: requestId,
        tag: "API",
        object: error,
      },
    );
    if (
      env.SCHED_BOT_ADMIN_TGID &&
      env.NODE_ENV === "production" &&
      path.startsWith("/api/") // Ignore errors on non-API routes
    ) {
      void api.tasks.scheduleMessages.post([
        {
          chatId: env.SCHED_BOT_ADMIN_TGID.toString(),
          sendAt: new Date(),
          text: `(${requestId}) Error in request ${request.method} ${path}: ${JSON.stringify(error)}`,
          source: "ElysiaError",
          entities: [],
        },
      ]);
    }
  })
  .onAfterResponse(async ({ request, set, path }) => {
    const requestId = set.headers["x-request-id"];
    const requestStart = Number(set.headers["x-request-time"]);
    const requestTime = Date.now() - requestStart;
    log.debug(
      `-> ${request.method[0]} ${set.status ?? "unk"} ${path} – ${requestTime}ms`,
      {
        user: requestId,
        tag: "API",
      },
    );
  })
  .get("/ok", () => "ok")
  .use(apiApp);

export type ScheduleTelegramBotApp = typeof app;

async function resolveTlsMaterial(input: string): Promise<string> {
  const trimmed = input.trimStart();
  if (trimmed.startsWith("-----BEGIN")) {
    return input;
  }

  return await Bun.file(input).text();
}

async function getTlsOptions() {
  const certSource = env.SCHED_BOT_TLS_CERT;
  const keySource = env.SCHED_BOT_TLS_KEY;

  if (typeof certSource !== "string" || typeof keySource !== "string") {
    return undefined;
  }

  log.info("TLS configuration detected. Resolving certificate and key...", {
    tag: "Ely",
    user: "tls",
  });

  return {
    cert: await resolveTlsMaterial(certSource),
    key: await resolveTlsMaterial(keySource),
  };
}

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
  const tls = await getTlsOptions();

  app.listen(
    {
      port: env.SCHED_BOT_PORT,
      hostname: env.SCHED_BOT_HOST,
      ...(tls ? { tls } : {}),
    },
    () => {
      log.info(
        `Elysia server started at ${app.server?.hostname}:${app.server?.port}`,
        { tag: "init", user: "Elysia" },
      );
    },
  );

  init_bot_webhook();
  void init_bot();
  void connectionCheck({ sendOnline: true });
}

async function connectionCheck(opts: { sendOnline?: boolean } = {}) {
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
          tag: "init",
          user: "Elysia",
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  log.info("Successfully connected to schedule server", {
    tag: "init",
    user: "Elysia",
  });
  if (opts.sendOnline) {
    await api.botOnline.post(undefined, {
      headers: {
        "x-internal-api-secret": env.SCHED_SERVER_INTERNAL_API_SECRET,
      },
    });
  }
}

void start();
