import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { env } from "./env";
import log from "./logger";
import { intervaljobs, cronjobs } from "./lib/tasks";
import path from "node:path";
import { apiApp } from "./api";
import { ToadScheduler } from "toad-scheduler";
import { botApi } from "./lib/botApiClient";
import { scheduleMessage } from "./lib/misc";

//TODO: Elysia.cron

const publicPath =
  env.NODE_ENV === "development"
    ? path.resolve("../client/dist")
    : path.resolve("/app/public");

let requestIdCounter = 0;

const app = new Elysia()
  .use(openapi())
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
  .onError(({ request, error, set }) => {
    const requestId = set.headers["x-request-id"];
    const path = new URL(request.url).pathname;
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
    if (env.SCHED_BOT_ADMIN_TGID && env.NODE_ENV === "production") {
      void scheduleMessage(
        env.SCHED_BOT_ADMIN_TGID,
        new Date(),
        `(${requestId}) Error in request ${request.method} ${path}: ${JSON.stringify(error)}`,
        { source: "ElysiaError" },
      );
    }
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
        tag: "API",
      },
    );
  })
  // api routes
  .use(apiApp)
  // Static file serving
  .get("/*", async ({ request, status }) => {
    const url = new URL(request.url).pathname;
    if (url.startsWith("/api"))
      return new Response("Not Found", { status: 404 });

    if (url === "/") {
      const file = Bun.file(path.resolve(publicPath, "index.html"));
      if (!(await file.exists())) {
        return status(404);
      }
      return file;
    }
    const file = Bun.file(path.resolve(publicPath, url.slice(1)));
    if (!(await file.exists())) {
      return status(404);
    }
    return file;
  });

export type ScheduleServerApp = typeof app;

const scheduler = new ToadScheduler();

async function connectionCheck(opts: { sendOnline?: boolean } = {}) {
  let success = false;
  while (!success) {
    let e: Error | null = null;
    await botApi.health
      .get({
        headers: {
          "x-internal-api-secret": env.SCHED_SERVER_INTERNAL_API_SECRET,
        },
      })
      .then((res) => (success = res.data === "ok"))
      .catch((err: Error) => {
        e = err;
      });

    if (!success) {
      log.warn(
        "Unable to connect to bot server" + (e ? ": " + JSON.stringify(e) : ""),
        {
          tag: "init",
          user: "Elysia",
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  log.info("Successfully connected to bot server", {
    tag: "init",
    user: "Elysia",
  });
  if (opts.sendOnline) {
    await botApi.serverOnline.post(undefined, {
      headers: {
        "x-internal-api-secret": env.SCHED_SERVER_INTERNAL_API_SECRET,
      },
    });
  }
}

async function start() {
  // await init_redis(server);
  // await init_bot();

  app.listen(env.SCHED_SERVER_PORT, () => {
    log.info(
      `Elysia server started at ${app.server?.hostname}:${app.server?.port}`,
      { tag: "init", user: "Elysia" },
    );
  });

  for (const job of intervaljobs) scheduler.addIntervalJob(job);
  for (const job of cronjobs) scheduler.addCronJob(job);

  void connectionCheck({ sendOnline: true });
}

void start();
