import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

export const LkLoginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  saveCredentials: z.boolean().default(false),
});

export const LkLoginSuccessSchema = z.object({
  success: z.literal(true),
  error: z.null(),
});

export const LkLoginFailureSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export const lkContract = c.router({
  login: {
    method: "POST",
    path: "/login",
    body: LkLoginBodySchema,
    responses: {
      200: LkLoginSuccessSchema,
      400: z.union([z.string(), LkLoginFailureSchema]),
      403: z.string(),
    },
  },
});
