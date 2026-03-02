import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

export const AuthDataSchema = z
  .object({
    userId: z.number(),
    tgId: z.string(),
  })
  .nullable();

export const AuthUserSchema = z.object({
  id: z.number(),
  tgId: z.string(),
  password: z.string().nullable().optional(),
  authCookie: z.boolean().optional(),
});

export const AuthStatusSchema = z.object({
  authorized: z.boolean(),
  auth: AuthDataSchema,
  error: z.unknown().optional(),
  user: AuthUserSchema.nullable(),
});

export const AuthLoginBodySchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export const authContract = c.router({
  login: {
    method: "POST",
    path: "/login",
    body: AuthLoginBodySchema,
    responses: {
      400: z.string(),
      501: z.string(),
    },
  },
  auth: {
    method: "GET",
    path: "/auth",
    responses: {
      200: AuthStatusSchema,
    },
  },
  whoami: {
    method: "GET",
    path: "/whoami",
    responses: {
      200: AuthUserSchema,
      403: z.string(),
    },
  },
});
