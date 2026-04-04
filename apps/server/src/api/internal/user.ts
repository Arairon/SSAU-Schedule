import Elysia from "elysia";
import z from "zod";

import { db } from "@/db";
import type { User } from "@/generated/prisma/client";
import {
  getUserPreferences,
  UserPreferencesSchema,
} from "@ssau-schedule/shared/utils";
import { lk } from "@/ssau/lk";
import {
  invalidateDailyNotificationsForTarget,
  scheduleDailyNotificationsForUser,
} from "@/lib/tasks";
import { getUserIcsByUserId } from "@/schedule/ics";

export const UserSchema = z.object({
  id: z.number(),
  tgId: z.bigint(),
  groupId: z.number().nullable(),
  subgroup: z.number().nullable(),
  authCookie: z.string().nullable(),
  password: z.string().nullable(),
  staffId: z.number().nullable(),
  fullname: z.string().nullable(),
  authCookieExpiresAt: z.date(),
  sessionExpiresAt: z.date(),
  username: z.string().nullable(),
  preferences: UserPreferencesSchema,
  allowsAccountProxyUse: z.boolean(),
  lastActive: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserType = z.infer<typeof UserSchema>;

export const RedactedUserSchema = UserSchema.extend({
  tgId: z.string(),
  password: z.string().nullable(),
  authCookie: z.boolean(),
});

export type RedactedUser = z.infer<typeof RedactedUserSchema>;

export const RedactedUserWithGroupSchema = RedactedUserSchema.extend({
  group: z.object({ id: z.number(), name: z.string() }).nullable(),
});

export type RedactedUserWithGroup = z.infer<typeof RedactedUserWithGroupSchema>;

export const LkLoginBodySchema = z.object({
  username: z.string(),
  password: z.string(),
  saveCredentials: z.boolean(),
});

export function redactUser(user: User): z.infer<typeof RedactedUserSchema> {
  return {
    ...user,
    preferences: getUserPreferences(user),
    tgId: user.tgId.toString(),
    password: user.password ? "redacted" : null,
    authCookie: !!user.authCookie,
  };
}

export function redactUserWithGroup(
  user: User & { group: { id: number; name: string } | null },
): z.infer<typeof RedactedUserWithGroupSchema> {
  return {
    ...user,
    preferences: getUserPreferences(user),
    tgId: user.tgId.toString(),
    password: user.password ? "redacted" : null,
    authCookie: !!user.authCookie,
  };
}

export const UserUpdateRequestSchema = z.object({
  groupId: z.number().nullable(),
  preferences: UserPreferencesSchema,
  subgroup: z.number().nullable(),
  allowsAccountProxyUse: z.boolean(),
});

const icsSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  validUntil: z.date(),
  data: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const app = new Elysia()
  .post(
    "/new",
    async ({ body }) => {
      const res = await db.user.create({
        data: body,
      });
      return redactUser(res);
    },
    {
      body: z.object({
        tgId: z.coerce.bigint(),
      }),
      response: {
        200: RedactedUserSchema,
      },
    },
  )
  .get(
    "/id/:id",
    async ({ params, status }) => {
      const user = await db.user.findUnique({
        where: { id: params.id },
        include: { group: true },
      });
      if (!user) return status(404, "User not found");

      return redactUserWithGroup(user);
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      response: {
        200: RedactedUserWithGroupSchema,
        404: z.string(),
      },
    },
  )
  .get(
    "/tgid/:id",
    async ({ params, status }) => {
      const user = await db.user.findUnique({
        where: { tgId: params.id },
        include: { group: true },
      });
      if (!user) return status(404, "User not found");

      return redactUserWithGroup(user);
    },
    {
      params: z.object({
        id: z.coerce.bigint(),
      }),
      response: {
        200: RedactedUserWithGroupSchema,
        404: z.string(),
      },
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
        include: { group: true },
      });

      return redactUserWithGroup(updatedUser);
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      body: UserUpdateRequestSchema.partial(),
      response: {
        200: RedactedUserWithGroupSchema,
        404: z.string(),
      },
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
      response: {
        200: z.string(),
        404: z.string(),
      },
    },
  )
  .post(
    "/id/:id/lk/login",
    async ({ body, params, status }) => {
      const user = (await db.user.findUnique({ where: { id: params.id } }))!;
      const result = await lk.login(user, body);

      if (result.ok) {
        const res = await lk.updateUserInfo(user);
        if (res.ok) {
          const updatedUser = await db.user.findUnique({
            where: { id: user.id },
          });
          return {
            success: true,
            error: null,
            user: redactUser(updatedUser!),
          };
        } else {
          return status(400, {
            success: false,
            error: `${res.error}: ${res.message}`,
          });
        }
      }

      return status(400, {
        success: false,
        error: `${result.error}: ${result.message}`,
      });
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      body: LkLoginBodySchema,
      response: {
        200: z.object({
          success: z.literal(true),
          error: z.null(),
          user: RedactedUserSchema,
        }),
        400: z.object({
          success: z.literal(false),
          error: z.string(),
        }),
      },
    },
  )
  .post(
    "/id/:id/lk/updateInfo",
    async ({ params, status, query }) => {
      const user = (await db.user.findUnique({ where: { id: params.id } }))!;

      const res = await lk.updateUserInfo(user, {
        overrideGroup: query.overrideGroup,
      });
      if (res.ok) {
        return {
          success: true,
          error: null,
          user: redactUser(res.data),
        };
      } else {
        return status(400, {
          success: false,
          error: `${res.error}: ${res.message}`,
        });
      }
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      query: z.object({
        overrideGroup: z
          .string()
          .transform((val) => val.toLowerCase() === "true")
          .default(false),
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          error: z.null(),
          user: RedactedUserSchema,
        }),
        400: z.object({
          success: z.literal(false),
          error: z.string(),
        }),
      },
    },
  )
  .post(
    "/id/:id/lk/saveCredentials",
    ({ params, body }) => {
      return lk.saveCredentials(params.id, body);
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      body: z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }),
      response: {
        200: z.void(),
      },
    },
  )
  .post(
    "/id/:id/lk/clearCredentials",
    async ({ params }) => {
      await lk.resetAuth(params.id, { resetCredentials: true });
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      response: {
        200: z.void(),
      },
    },
  )
  .post(
    "/id/:id/notifications/clear",
    async ({ params, status }) => {
      const user = await db.user.findUnique({ where: { id: params.id } });
      if (!user) return status(404, "User not found");
      const res = await invalidateDailyNotificationsForTarget(
        user.tgId.toString(),
      );
      return { cleared: res.count };
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      response: {
        200: z.object({ cleared: z.number() }),
        404: z.string(),
      },
    },
  )
  .post(
    "/id/:id/notifications/reschedule",
    async ({ params, status }) => {
      const user = await db.user.findUnique({ where: { id: params.id } });
      if (!user) return status(404, "User not found");
      const cleared = await invalidateDailyNotificationsForTarget(
        user.tgId.toString(),
      );
      const scheduled = await scheduleDailyNotificationsForUser(user);
      return { cleared: cleared.count, scheduled: scheduled?.count ?? 0 };
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      response: {
        200: z.object({ cleared: z.number(), scheduled: z.number() }),
        404: z.string(),
      },
    },
  )
  .get(
    "/id/:id/ics",
    async ({ params, status }) => {
      const cal: z.infer<typeof icsSchema> | null = await getUserIcsByUserId(
        params.id,
      );
      if (!cal) {
        return status(500, "Failed to generate ICS");
      }
      return cal;
    },
    {
      params: z.object({
        id: z.coerce.number().int(),
      }),
      response: {
        200: icsSchema,
        500: z.string(),
      },
    },
  )
  .get(
    "/all",
    async () => {
      const users = await db.user.findMany();
      return users.map(redactUser) as unknown as z.infer<
        typeof RedactedUserSchema
      >[];
    },
    {
      response: {
        200: z.array(RedactedUserSchema),
      },
    },
  );
