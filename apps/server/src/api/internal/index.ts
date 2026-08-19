import z from "zod"
import { env } from "@/server/env"
import { Elysia } from "elysia"
import { app as routesCache } from "./cache"
import { app as routesGroupChat } from "./groupchat"
import { app as routesMisc } from "./misc"
import { app as routesSchedule } from "./schedule"
import { app as routesSsau } from "./ssau"
import { app as routesTasks } from "./tasks"
import { app as routesUser } from "./user"
import { app as routesGroup } from "./group"
import { app as routesTeacher } from "./teacher"
import { app as routesDebug } from "./debug"
import log from "@/server/logger"

export const app = new Elysia({ prefix: "/internal" }).guard(
  {
    beforeHandle: async ({ headers, status }) => {
      if (
        headers["x-internal-api-secret"] !==
        env.SCHED_SERVER_INTERNAL_API_SECRET
      ) {
        return status(403, "Forbidden")
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
      .post("/botOnline", () => {
        log.info("Bot has come online", { tag: "API", user: "bot" })
      })
      .group("/schedule", (app) => app.use(routesSchedule))
      .group("/user", (app) => app.use(routesUser))
      .group("/groupchat", (app) => app.use(routesGroupChat))
      .group("/cache", (app) => app.use(routesCache))
      .group("/ssau", (app) => app.use(routesSsau))
      .group("/misc", (app) => app.use(routesMisc))
      .group("/tasks", (app) => app.use(routesTasks))
      .group("/group", (app) => app.use(routesGroup))
      .group("/teacher", (app) => app.use(routesTeacher))
      .group("/debug", (app) => app.use(routesDebug)),
)
