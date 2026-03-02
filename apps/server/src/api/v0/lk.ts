import { type FastifyInstance } from "fastify";
import { lk } from "@/ssau/lk";
import { db } from "@/db";
import { type AuthData } from "./auth";
import { initServer } from "@ts-rest/fastify";
import { lkContract } from "@ssau-schedule/contracts/v0/lk";

const s = initServer();

const router = s.router(lkContract, {
  login: async ({ body, request }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const result = await lk.login(user, body);
    if (result.ok) {
      await lk.updateUserInfo(user);
      return { status: 200, body: { success: true, error: null } };
    }

    return {
      status: 400,
      body: {
        success: false,
        error: `${result.error}: ${result.message}`,
      },
    };
  },
});

export async function routesLk(fastify: FastifyInstance) {
  s.registerRouter(lkContract, router, fastify);
}
