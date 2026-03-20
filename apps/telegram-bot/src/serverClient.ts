import { treaty } from "@elysiajs/eden";
import { env } from "./env";

import type { ScheduleServerApp } from "@ssau-schedule/server/src/index";

const app = treaty<ScheduleServerApp>(env.SCHED_BOT_INTERNAL_API_URL, {
  headers: {
    "x-internal-api-secret": env.SCHED_BOT_INTERNAL_API_SECRET,
  },
});

export const serverApi = app;
export const api = app.api.internal;
