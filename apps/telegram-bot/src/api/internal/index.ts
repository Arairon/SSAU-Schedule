import { env } from "@/env";
import { Elysia } from "elysia";
import z from "zod";
import { app as routesDispatch } from "./dispatch";
import log from "@/logger";
import { bot } from "@/bot";

export const app = new Elysia({ prefix: "/internal" }).guard(
  {
    headers: z.object({
      "x-internal-api-secret": z
        .string()
        .refine((val) => val === env.SCHED_SERVER_INTERNAL_API_SECRET, {
          message: "Invalid internal API secret",
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
