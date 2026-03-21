import Elysia from "elysia";
import z from "zod";

import { db } from "@/db";
import {
  invalidateDailyNotificationsForAll,
  invalidateDailyNotificationsForTarget,
} from "@/lib/tasks";
import type { WeekImageWhereInput } from "@/generated/prisma/models";

const InvalidateWeekSchema = z
  .object({
    all: z.boolean().optional(),
    owner: z.coerce.number().int().optional(),
    groupId: z.coerce.number().int().optional(),
    year: z.coerce.number().int().optional(),
    number: z.coerce.number().int().optional(),
  })
  .refine(
    (data) =>
      data.all === true ||
      data.owner !== undefined ||
      data.groupId !== undefined ||
      data.year !== undefined ||
      data.number !== undefined,
    {
      message:
        "Provide all=true or at least one week filter: owner/groupId/year/number",
    },
  );

const InvalidateDailyNotificationsSchema = z
  .object({
    all: z.boolean().optional(),
    chatId: z.string().optional(),
  })
  .refine((data) => data.all === true || typeof data.chatId === "string", {
    message: "Provide all=true or chatId",
  });

const InvalidateUserIcsSchema = z
  .object({
    all: z.boolean().optional(),
    userId: z.coerce.number().int().optional(),
  })
  .refine((data) => data.all === true || data.userId !== undefined, {
    message: "Provide all=true or userId",
  });

const UpdateWeekImageTgIdSchema = z
  .object({
    all: z.boolean().optional(),
    id: z.coerce.number().int().optional(),
    hash: z.string().optional(),
    stylemap: z.string().optional(),
    hard: z.boolean().optional().default(false),
  })
  .refine(
    (data) =>
      data.all === true ||
      data.id !== undefined ||
      (data.hash && data.stylemap),
    {
      message: "Provide all=true or id or hash+stylemap",
    },
  );

export const app = new Elysia()
  .patch(
    "/week/invalidate",
    async ({ body }) => {
      const where = body.all
        ? {}
        : {
            ...(body.owner !== undefined ? { owner: body.owner } : {}),
            ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
            ...(body.year !== undefined ? { year: body.year } : {}),
            ...(body.number !== undefined ? { number: body.number } : {}),
          };

      const result = await db.week.updateMany({
        where,
        data: { cachedUntil: new Date(0) },
      });

      return { updated: result.count };
    },
    {
      body: InvalidateWeekSchema,
    },
  )
  .patch(
    "/notifications/daily/invalidate",
    async ({ body }) => {
      const result = body.all
        ? await invalidateDailyNotificationsForAll()
        : await invalidateDailyNotificationsForTarget(body.chatId!);

      return { updated: result.count };
    },
    {
      body: InvalidateDailyNotificationsSchema,
    },
  )
  .patch(
    "/user-ics/invalidate",
    async ({ body }) => {
      const where = body.all ? {} : { id: body.userId! };
      const result = await db.userIcs.updateMany({
        where,
        data: { validUntil: new Date(0) },
      });

      return { updated: result.count };
    },
    {
      body: InvalidateUserIcsSchema,
    },
  )
  .patch(
    "/week-image/invalidate",
    async ({ body }) => {
      const action = body.hard
        ? (filter: WeekImageWhereInput) =>
            db.weekImage.deleteMany({ where: filter })
        : (filter: WeekImageWhereInput) =>
            db.weekImage.updateMany({
              where: filter,
              data: { validUntil: new Date() },
            });
      let res: Awaited<ReturnType<typeof action>>;
      if (body.all) {
        res = await action({});
      } else {
        if (body.id) {
          res = await action({ id: body.id });
        } else {
          res = await action({
            timetableHash: body.hash!,
            stylemap: body.stylemap!,
          });
        }
      }

      return res as { count: number };
    },
    {
      body: UpdateWeekImageTgIdSchema,
    },
  );
