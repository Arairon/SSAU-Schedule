import { env } from "@/bot/env";
import { Elysia } from "elysia";
import z from "zod";
import { app as routesDispatch } from "./dispatch";
import log from "@/bot/logger";
import { bot } from "@/bot/bot";

export const app = new Elysia({ prefix: "/internal" }).guard(
  {
    beforeHandle: async ({ headers, status }) => {
      if (
        headers["x-internal-api-secret"] !==
        env.SCHED_SERVER_INTERNAL_API_SECRET
      ) {
        return status(403, "Forbidden");
      }
    },
    headers: z.object({
      "x-internal-api-secret": z.string({
        error: "Missing internal API secret",
      }),
    }),
  },
  (app) =>
    app
      .get("/health", () => "ok")
      .post("/serverOnline", () => {
        log.info("Server has come online", { tag: "API", user: "server" });
        if (env.SCHED_BOT_ADMIN_TGID && env.NODE_ENV === "production") {
          void bot.api.sendMessage(
            env.SCHED_BOT_ADMIN_TGID,
            "Сервер запущен!\nЕсли вы видите это не в момент запуска, то значит сервер крашнулся :D",
          );
        }
      })
      .use(routesDispatch),
);
