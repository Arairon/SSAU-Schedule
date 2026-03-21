import { db } from "@/db";
import type { WithAuth } from "./auth";
import {
  invalidateDailyNotificationsForTarget,
  scheduleDailyNotificationsForUser,
} from "@/lib/tasks";
import Elysia from "elysia";

export const app = new Elysia<"/notifications", WithAuth>({
  prefix: "/notifications",
}).post("/reschedule", async ({ auth, status }) => {
  if (!auth) {
    return status(403, "Unauthorized");
  }

  const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
  const invResult = await invalidateDailyNotificationsForTarget(auth.tgId);
  const updResult = await scheduleDailyNotificationsForUser(user);

  return {
    removed: invResult.count,
    added: updResult?.count ?? -1,
  };
});
