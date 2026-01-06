import { type FastifyInstance } from "fastify";
import { routesIcs } from "./ics";
import { routesTelegramUser } from "./tg";

export async function routesv0(fastify: FastifyInstance) {
  fastify.register(routesIcs, { prefix: "/ics" });
  fastify.register(routesTelegramUser, { prefix: "/tg" });
}
