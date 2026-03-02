import { type FastifyInstance } from "fastify";
import { db } from "@/db";
import { type AuthData } from "./auth";
import { createApiKeyAndStore, validateApiKey } from "@/lib/apiKey";
import { initServer } from "@ts-rest/fastify";
import { apiKeyContract } from "@ssau-schedule/contracts/v0/apiKey";

const s = initServer();

const router = s.router(apiKeyContract, {
  create: async ({ request }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const { key, info } = await createApiKeyAndStore(
      user.id,
      new Date(Date.now() + 30 * 24 * 3600_000),
    );

    return {
      status: 200,
      body: {
        key,
        info: Object.assign({}, info, { keyHash: "redacted" }),
      },
    };
  },

  check: async ({ params }) => {
    return {
      status: 200,
      body: await validateApiKey({ key: params.key }),
    };
  },

  list: async ({ request }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    return {
      status: 200,
      body: await db.userApiKey.findMany({
        where: {
          userId: auth.userId,
          revoked: false,
          expiresAt: { gt: new Date() },
        },
      }),
    };
  },

  revoke: async ({ params, request }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    const keyId = Number(params.keyId);
    return {
      status: 200,
      body: !!(
        await db.userApiKey.updateMany({
          where: { id: keyId, userId: auth.userId, revoked: false },
          data: { revoked: true },
        })
      ).count,
    };
  },
});

export async function routesApiKey(fastify: FastifyInstance) {
  s.registerRouter(apiKeyContract, router, fastify);
}
