import { lk } from "@/ssau/lk";
import { db } from "@/db";
import type { WithAuth } from "./auth";
import Elysia from "elysia";
import { LkLoginBodySchema } from "@ssau-schedule/contracts/v0/lk";

export const app = new Elysia<"/lk", WithAuth>({ prefix: "/lk" }).post(
  "/login",
  async ({ body, auth, status }) => {
    if (!auth) {
      return status(403, "Unauthorized");
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const result = await lk.login(user, body);

    if (result.ok) {
      await lk.updateUserInfo(user);
      return { success: true, error: null };
    }

    return status(400, {
      success: false,
      error: `${result.error}: ${result.message}`,
    });
  },
  {
    body: LkLoginBodySchema,
  },
);
