import { Elysia } from "elysia";
import { app as routesSchedule } from "./schedule";
import { app as routesUser } from "./user";
import { env } from "@/env";
import z from "zod";

export const app = new Elysia({ prefix: "/internal" }).guard(
  {
    headers: z.object({
      "x-internal-api-secret": z
        .string()
        .refine((val) => val === env.SCHED_BOT_INTERNAL_API_SECRET, {
          message: "Invalid internal API secret",
        }),
    }),
  },
  (app) =>
    app
      .get("/health", () => "ok")
      .group("/schedule", (app) => app.use(routesSchedule))
      .group("/user", (app) => app.use(routesUser)),
);
