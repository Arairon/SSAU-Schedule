import { db } from "@/db";
import type { WithAuth } from "./auth";
import { createApiKeyAndStore, validateApiKey } from "@/lib/apiKey";
import Elysia from "elysia";
import z from "zod";

export const app = new Elysia<"/key", WithAuth>({ prefix: "/key" })
  .get("/new", async ({ auth, status }) => {
    if (!auth) {
      return status(403, "Unauthorized");
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const { key, info } = await createApiKeyAndStore(
      user.id,
      new Date(Date.now() + 30 * 24 * 3600_000),
    );

    return {
      key,
      info: Object.assign({}, info, { keyHash: "redacted" }),
    };
  })
  .get(
    "/check/:key",
    async ({ params }) => {
      return await validateApiKey({ key: params.key });
    },
    { params: z.object({ key: z.string() }) },
  )
  .get("/list", async ({ auth, status }) => {
    if (!auth) {
      return status(403, "Unauthorized");
    }

    return await db.userApiKey.findMany({
      where: {
        userId: auth.userId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
    });
  })
  .delete(
    "/:keyId",
    async ({ params, auth, status }) => {
      if (!auth) {
        return status(403, "Unauthorized");
      }

      return !!(
        await db.userApiKey.updateMany({
          where: { id: params.keyId, userId: auth.userId, revoked: false },
          data: { revoked: true },
        })
      ).count;
    },
    { params: z.object({ keyId: z.coerce.number() }) },
  );
