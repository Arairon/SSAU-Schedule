import { type FastifyInstance, type FastifyRequest } from "fastify";
import { db } from "@/db";
import { type AuthData } from "./auth";
import {
  invalidateDailyNotificationsForTarget,
  scheduleDailyNotificationsForUser,
} from "@/lib/tasks";

export async function routesNotifications(fastify: FastifyInstance) {
  fastify.post(
    "/reschedule",
    {},
    async (req: FastifyRequest<{ Body: unknown }>, res) => {
      const auth: AuthData = req.getDecorator("authData");
      if (!auth) return res.status(403).send("Unauthorized");
      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;

      const invResult = await invalidateDailyNotificationsForTarget(auth.tgId);
      const updResult = await scheduleDailyNotificationsForUser(user);

      res
        .status(200)
        .send({ removed: invResult.count, added: updResult?.count ?? -1 });
    },
  );
}
