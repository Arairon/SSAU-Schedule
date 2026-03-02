import { type FastifyInstance } from "fastify";
import { initServer } from "@ts-rest/fastify";
import { getUserIcsByUserId, getUserIcsByUUID } from "@/schedule/ics";
import { type AuthData } from "./auth";
import { icsContract } from "@ssau-schedule/contracts/v0/ics";

const s = initServer();

const router = s.router(icsContract, {
  getOwnIcs: async ({ request, reply }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    const cal = await getUserIcsByUserId(auth.userId);
    if (!cal) {
      return {
        status: 404,
        body: {
          error: "not found",
          message: "Could not generate Calendar",
        },
      };
    }

    reply.header("content-type", "text/calendar; charset=utf-8");
    return { status: 200, body: cal.data };
  },

  getIcsByUuid: async ({ params, reply }) => {
    const cal = await getUserIcsByUUID(params.icsUUID);
    if (!cal) {
      return {
        status: 404,
        body: {
          error: "not found",
          message: "Could not find such Calendar",
        },
      };
    }

    reply.header("content-type", "text/calendar; charset=utf-8");
    return { status: 200, body: cal.data };
  },
});

export async function routesIcs(fastify: FastifyInstance) {
  s.registerRouter(icsContract, router, fastify);
}
