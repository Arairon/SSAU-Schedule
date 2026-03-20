import { initServer } from "@ts-rest/fastify";
import { type FastifyInstance } from "fastify";

import { internalContract } from "@ssau-schedule/contracts/internal";
import { userRoutes } from "./user";
import { scheduleRoutes } from "./schedule";

const s = initServer();

const router = s.router(internalContract, {
  user: userRoutes,
  schedule: scheduleRoutes,
});

export async function routesInternal(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (req, res) => {
    if (
      req.headers["x-internal-api-secret"] !==
      process.env.SCHED_BOT_INTERNAL_API_SECRET
    ) {
      res.status(403).send("Forbidden");
      return;
    }
  });

  // s.registerRouter(internalContract, router, fastify);
  fastify.register(s.plugin(router));
}
