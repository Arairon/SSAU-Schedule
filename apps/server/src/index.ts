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
      tag: "Ely",
    });
  })
  .onError(({ request, error, set }) => {
    const requestId = set.headers["x-request-id"];
    const path = new URL(request.url).pathname;
    log.warn(
      `XX ${request.method.padEnd(5, " ")} ${path} – ${JSON.stringify(error)}`,
      {
        user: requestId,
        tag: "Ely",
      },
    );
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

async function start() {
  // await init_redis(server);
  // await init_bot();

  app.listen(env.SCHED_SERVER_PORT, () => {
    log.info(
      `Elysia server started at ${app.server?.hostname}:${app.server?.port}`,
      { tag: "Ely", user: 0 },
    );
  });

  for (const job of intervaljobs) scheduler.addIntervalJob(job);
  for (const job of cronjobs) scheduler.addCronJob(job);
}
void start();

async function connectionCheck() {
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
          user: "init",
          tag: "Ely",
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  log.info("Successfully connected to bot server", {
    user: "init",
    tag: "Ely",
  });
}

void connectionCheck();
