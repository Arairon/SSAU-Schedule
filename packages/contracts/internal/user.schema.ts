import { z } from "zod";

export const UserPresenceSchema = z.object({
  theme: z.string().default("default"),
  showIet: z.boolean().default(true),
  showMilitary: z.boolean().default(true),
  notifyBeforeLessons: z.number().default(0),
  notifyAboutNextLesson: z.boolean().default(false),
  notifyAboutNextDay: z.boolean().default(false),
  notifyAboutNextWeek: z.boolean().default(false),
  trustedLessonCustomizers: z.number().array().default([]),
});

export const UserResponseSchema = z.object({
  id: z.number(),
  tgId: z.coerce.bigint(),
  staffId: z.number().nullable(),
  fullname: z.string().nullable(),
  groupId: z.number().nullable(),
  authCookie: z.boolean(),
  authCookieExpiresAt: z.date(),
  sessionExpiresAt: z.date(),
  username: z.string().nullable(),
  password: z.string().nullable(),
  preferences: UserPresenceSchema,
  subgroup: z.number().nullable(),
  lastActive: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const UserUpdateRequestSchema = UserResponseSchema.pick({
  groupId: true,
  preferences: true,
  subgroup: true,
  lastActive: true,
});
