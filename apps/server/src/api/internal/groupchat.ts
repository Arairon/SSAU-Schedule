import Elysia from "elysia";
import z from "zod";

import { db } from "@/db";
import type { GroupChat, User } from "@/generated/prisma/client";

type GroupChatWithUser = GroupChat & {
  user: User | null;
};

function serializeGroupChat(groupChat: GroupChatWithUser) {
  const { tgId, user, ...rest } = groupChat;
  return {
    ...rest,
    tgId: tgId.toString(),
    user: user
      ? {
          ...user,
          tgId: user.tgId.toString(),
          password: user.password ? "redacted" : null,
          authCookie: !!user.authCookie,
        }
      : null,
  };
}

const GroupChatCreateSchema = z.object({
  tgId: z.coerce.bigint(),
  groupId: z.coerce.number().int().nullable().optional(),
  userId: z.coerce.number().int().nullable().optional(),
  updatesEnabled: z.boolean().optional(),
});

const GroupChatPatchSchema = GroupChatCreateSchema.partial();

export const app = new Elysia()
  .get(
    "/id/:id",
    async ({ params, status }) => {
      const groupChat = await db.groupChat.findUnique({
        where: { id: params.id },
        include: { user: true },
      });
      if (!groupChat) return status(404, "GroupChat not found");

      return serializeGroupChat(groupChat);
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
      const groupChat = await db.groupChat.findUnique({
        where: { tgId: params.id },
        include: { user: true },
      });
      if (!groupChat) return status(404, "GroupChat not found");

      return serializeGroupChat(groupChat);
    },
    {
      params: z.object({
        id: z.coerce.bigint(),
      }),
    },
  )
  .post(
    "/",
    async ({ body, status }) => {
      const groupChat = await db.groupChat.create({
        data: body,
        include: { user: true },
      });

      return status(201, serializeGroupChat(groupChat));
    },
    {
      body: GroupChatCreateSchema,
    },
  )
  .patch(
    "/id/:id",
    async ({ params, body, status }) => {
      const existing = await db.groupChat.findUnique({
        where: { id: params.id },
      });
      if (!existing) return status(404, "GroupChat not found");

      const groupChat = await db.groupChat.update({
        where: { id: existing.id },
        data: body,
        include: { user: true },
      });

      return serializeGroupChat(groupChat);
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      body: GroupChatPatchSchema,
    },
  )
  .delete(
    "/id/:id",
    async ({ params, status }) => {
      const groupChat = await db.groupChat.findUnique({
        where: { id: params.id },
      });
      if (!groupChat) return status(404, "GroupChat not found");

      await db.groupChat.delete({ where: { id: groupChat.id } });
      return "GroupChat deleted";
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
    },
  )
  .delete(
    "/tgid/:id",
    async ({ params, status }) => {
      const groupChat = await db.groupChat.findUnique({
        where: { tgId: params.id },
      });
      if (!groupChat) return status(404, "GroupChat not found");

      await db.groupChat.delete({ where: { id: groupChat.id } });
      return "GroupChat deleted";
    },
    {
      params: z.object({
        id: z.coerce.bigint(),
      }),
    },
  );
