import { type FastifyInstance } from "fastify";
import { db } from "@/db";
import { type AuthData } from "./auth";
import {
  invalidateDailyNotificationsForTarget,
  scheduleDailyNotificationsForUser,
} from "@/lib/tasks";
import { initServer } from "@ts-rest/fastify";
import { notificationsContract } from "@ssau-schedule/contracts/v0/notifications";

const s = initServer();

const router = s.router(notificationsContract, {
  reschedule: async ({ request }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const invResult = await invalidateDailyNotificationsForTarget(auth.tgId);
    const updResult = await scheduleDailyNotificationsForUser(user);

    return {
      status: 200,
      body: { removed: invResult.count, added: updResult?.count ?? -1 },
    };
  },
});

export async function routesNotifications(fastify: FastifyInstance) {
  s.registerRouter(notificationsContract, router, fastify);
}
