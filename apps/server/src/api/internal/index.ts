import { env } from "@/env";
import { Elysia } from "elysia";
import z from "zod";
import { app as routesCache } from "./cache";
import { app as routesGroupChat } from "./groupchat";
import { app as routesMisc } from "./misc";
import { app as routesSchedule } from "./schedule";
import { app as routesSsau } from "./ssau";
import { app as routesTasks } from "./tasks";
import { app as routesUser } from "./user";
import { app as routesGroup } from "./group";

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
      .group("/schedule", (app) => app.use(routesSchedule))
      .group("/user", (app) => app.use(routesUser))
      .group("/groupchat", (app) => app.use(routesGroupChat))
      .group("/cache", (app) => app.use(routesCache))
      .group("/ssau", (app) => app.use(routesSsau))
      .group("/misc", (app) => app.use(routesMisc))
      .group("/tasks", (app) => app.use(routesTasks))
      .group("/group", (app) => app.use(routesGroup)),
);
