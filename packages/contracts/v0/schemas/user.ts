import { z } from "zod";

export const UserSchema = z.object({
  id: z.number(),
  tgId: z.bigint(),
  staffId: z.number().nullable(),
  fullname: z.string().nullable(),
  groupId: z.number().nullable(),
  authCookie: z.string().nullable(),
  authCookieExpiresAt: z.date(),
  sessionExpiresAt: z.date(),
  username: z.string().nullable(),
  password: z.string().nullable(),
  preferences: z.unknown(),
  subgroup: z.number().nullable(),
  lastActive: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
