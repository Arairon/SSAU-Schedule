import { FastifyInstance } from "fastify";
import { routesIcs } from "./ics";

export async function routesv0(fastify: FastifyInstance) {
  fastify.register(routesIcs, { prefix: "/ics" });
}
