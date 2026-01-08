import { type FastifyInstance, type FastifyRequest } from "fastify";
import { db } from "../../db";
import { type AuthData } from "./auth";


export async function routesNotifications(fastify: FastifyInstance) {
  fastify.get(
    "/new",
    {},
    async (req: FastifyRequest<{ Body: unknown }>, res) => {
      const auth: AuthData = req.getDecorator("authData");
      if (!auth) return res.status(403).send("Unauthorized");
      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    },
  );
}
