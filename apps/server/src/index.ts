import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { env } from "./env";
import log from "./logger";
// import init_redis from "./redis";
import init_bot from "./bot/bot";
import { intervaljobs, cronjobs } from "./lib/tasks";
import path from "node:path";
import { apiApp } from "./api";
import { ToadScheduler } from "toad-scheduler";

//TODO: Elysia.cron

const publicPath =
  env.NODE_ENV === "development"
    ? path.resolve("../client/dist")
    : path.resolve("/app/public");

const test = new Elysia()
  .decorate(() => ({ test: 3 }))
  .resolve(({ headers }) => ({ test2: headers["x-test"] ?? "N/A" }));

type WithTest = {
  decorator: { test: number };
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  store: {};
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  derive: {};
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  resolve: {};
};

const test2 = new Elysia<"", WithTest>().get(
  "/test2",
  ({ test }) => test ?? "N/A2",
);

const app = new Elysia()
  .use(
    cors({
      credentials: true,
    }),
  )
  .state("requestId", 0)
  .derive(({ store }) => ({
    requestTime: Date.now(),
    requestId: store.requestId++,
  }))
  .onBeforeHandle(({ request, store: { requestId } }) => {
    log.debug(`<- ${request.method} ${request.url}`, {
      user: requestId,
      tag: "Ely",
    });
  })
  .onAfterResponse(async ({ request, requestTime, store: { requestId } }) => {
    log.debug(
      `-> ${request.method} ${request.url} – ${Date.now() - requestTime}ms`,
      { user: requestId, tag: "Ely" },
    );
  })
  .guard(
    {
      beforeHandle: async ({ request, status }) => {
        const url = new URL(request.url);
        console.log(url);
        if (url.hostname !== "localhost" || env.NODE_ENV !== "development")
          return status(404);
      },
    },
    (app) => app.use(openapi()),
  )
  // api routes
  .use(test)
  .get("/test", ({ test }) => test ?? "N/A")
  .use(test2)
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

console.log(`Started Elysia at ${app.server?.hostname}:${app.server?.port}`);

const scheduler = new ToadScheduler();

async function start() {
  // await init_redis(server);
  await init_bot();

  app.listen(env.SCHED_PORT, () => {
    log.info("Elysia server started", { tag: "Ely", user: 0 });
  });

  for (const job of intervaljobs) scheduler.addIntervalJob(job);
  for (const job of cronjobs) scheduler.addCronJob(job);
}
void start();
