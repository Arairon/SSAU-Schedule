import { type FastifyInstance, type FastifyRequest } from "fastify";
import { db } from "@/db";
import { type AuthData } from "./auth";
import { createApiKeyAndStore, validateApiKey } from "@/lib/apiKey";

export async function routesApiKey(fastify: FastifyInstance) {
  fastify.get(
    "/new",
    {},
    async (req: FastifyRequest<{ Body: unknown }>, res) => {
      const auth: AuthData = req.getDecorator("authData");
      if (!auth) return res.status(403).send("Unauthorized");
      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;

      const { key, info } = await createApiKeyAndStore(
        user.id,
        new Date(Date.now() + 30 * 24 * 3600_000),
      );

      return {
        key,
        info: Object.assign({}, info, { keyHash: "redacted" }),
      };
    },
  );

  fastify.get(
    "/check/:key",
    {},
    async (req: FastifyRequest<{ Params: { key: string } }>, res) => {
      const key = req.params.key;
      return res.status(200).send(await validateApiKey({ key }));
    },
  );

  fastify.get("/list", {}, async (req, res) => {
    const auth: AuthData = req.getDecorator("authData");
    if (!auth) return res.status(403).send("Unauthorized");
    return await db.userApiKey.findMany({
      where: {
        userId: auth.userId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
    });
  });

  fastify.delete(
    "/:keyId",
    {},
    async (req: FastifyRequest<{ Params: { keyId: number } }>, res) => {
      const auth: AuthData = req.getDecorator("authData");
      if (!auth) return res.status(403).send("Unauthorized");
      const keyId = Number(req.params.keyId);
      return !!(
        await db.userApiKey.updateMany({
          where: { id: keyId, userId: auth.userId, revoked: false },
          data: { revoked: true },
        })
      ).count;
    },
  );
}
