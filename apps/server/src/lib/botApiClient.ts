import { env } from "@/env";
import { treaty } from "@elysiajs/eden";

import type { ScheduleTelegramBotApp } from "@ssau-schedule/telegram-bot/src/index";

const app = treaty<ScheduleTelegramBotApp>(env.SCHED_BOT_DISPATCH_URL, {
  headers: {
    "x-internal-api-secret": env.SCHED_SERVER_INTERNAL_API_SECRET,
  },
});

export const botApi = app.api.internal;
