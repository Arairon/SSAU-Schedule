import { type FastifyInstance } from "fastify";
import { routesIcs } from "./ics";
import { routesCustomLesson } from "./customLesson";
import { registerAuth } from "./auth";
import { routesSchedule } from "./schedule";
import { routesNotifications } from "./notifications";

export async function routesv0(fastify: FastifyInstance) {
  await registerAuth(fastify);

  fastify.register(routesIcs, { prefix: "/ics" });
  fastify.register(routesSchedule, { prefix: "/schedule" });
  fastify.register(routesCustomLesson, { prefix: "/customLesson" });
  fastify.register(routesNotifications, { prefix: "/notifications" });
}
