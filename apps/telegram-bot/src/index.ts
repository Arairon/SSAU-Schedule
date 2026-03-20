import { Elysia } from "elysia";
import z from "zod";
import { Bot as GrammyBot, InputFile } from "grammy";
import type { MessageEntity } from "grammy/types";

import { env } from "@/env";
import log from "@/logger";

import init_bot from "@/bot";

const app = new Elysia().get("/ok", () => "ok");

app.listen(env.SCHED_BOT_PORT, () => {
  log.info(
    `Elysia started at http://${env.SCHED_BOT_HOST}:${env.SCHED_BOT_PORT}`,
    { tag: "Ely", user: "init" },
  );
});

void init_bot();

export type ScheduleTelegramBotApp = typeof app;
