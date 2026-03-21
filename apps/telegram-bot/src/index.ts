import { Elysia } from "elysia";

import { env } from "@/env";
import log from "@/logger";

import init_bot from "@/bot";
import { apiApp } from "./api";
import cors from "@elysiajs/cors";
import { api } from "./serverClient";

const app = new Elysia()
  // .use(openapi())
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
  .get("/ok", () => "ok")
  .use(apiApp);

app.listen(env.SCHED_BOT_PORT, () => {
  log.info(
    `Elysia started at http://${env.SCHED_BOT_HOST}:${env.SCHED_BOT_PORT}`,
    { tag: "Ely", user: "init" },
  );
});

void init_bot();

export type ScheduleTelegramBotApp = typeof app;

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
      .then((res) => (success = res.data === "ok"))
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

void connectionCheck();
