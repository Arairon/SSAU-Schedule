import Elysia from "elysia";
import z from "zod";

import { db } from "@/db";
import type { User } from "@/generated/prisma/client";
import { UserPreferencesSchema } from "@/lib/misc";

function redactUser(user: User) {
  return {
    ...user,
    tgId: user.tgId.toString(),
    password: user.password ? "redacted" : null,
    authCookie: !!user.authCookie,
  };
}

export const UserUpdateRequestSchema = z.object({
  groupId: z.number().nullable(),
  preferences: UserPreferencesSchema,
  subgroup: z.number().nullable(),
});

export const app = new Elysia()
  .get(
    "/id/:id",
    async ({ params, status }) => {
      const user = await db.user.findUnique({
        where: { id: params.id },
      });
      if (!user) return status(404, "User not found");

      return redactUser(user);
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
    },
  )
  .get(
    "/tgid/:id",
    async ({ params, status }) => {
      const user = await db.user.findUnique({
        where: { tgId: params.id },
      });
      if (!user) return status(404, "User not found");

      return redactUser(user);
    },
    {
      params: z.object({
        id: z.coerce.bigint(),
      }),
    },
  )
  .patch(
    "/id/:id",
    async ({ params, body, status }) => {
      const user = await db.user.findUnique({
        where: { id: params.id },
      });
      if (!user) return status(404, "User not found");

      const updatedUser = await db.user.update({
        where: { id: user.id },
        data: body,
      });

      return redactUser(updatedUser);
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      body: UserUpdateRequestSchema.partial(),
    },
  )
  .delete(
    "/id/:id",
    async ({ params, status }) => {
      const user = await db.user.findUnique({
        where: { id: params.id },
      });
      if (!user) return status(404, "User not found");

      await db.user.delete({
        where: { id: user.id },
      });

      return "User deleted";
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
    },
  );
