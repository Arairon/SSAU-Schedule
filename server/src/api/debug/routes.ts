import { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../../db";

export async function routesDebug(fastify: FastifyInstance) {
  const userIdParamSchema = {
    $id: "userId",
    type: "object",
    properties: {
      userId: {
        type: "number",
      },
    },
  };
  fastify.get(
    "/user/:userId",
    {
      schema: { params: userIdParamSchema }
    },
    async (
      req: FastifyRequest<{
        Params: { userId: number };
      }>,
      res,
    ) => {
      const userId = req.params.userId;
      const user = await db.user.findUnique({
        where: { id: userId },
      });
      if (!user)
        return res.status(404).send({
          error: "user not found",
          message: "Cannot find specified user",
        });
      return Object.assign({}, user, { tgId: user.tgId.toString(), password: "redacted", authCookie: !!user.authCookie })
    }
  )
}
