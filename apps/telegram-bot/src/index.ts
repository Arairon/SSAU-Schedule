import { Elysia } from "elysia";
import z from "zod";
import { Bot as GrammyBot, InputFile } from "grammy";
import type { MessageEntity } from "grammy/types";

import { env } from "@/env";
import log from "@/logger";

const app = new Elysia().get("/ok", () => "ok");

export type ScheduleTelegramBotApp = typeof app;
