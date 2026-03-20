import { initContract } from "@ts-rest/core";

import { UserResponseSchema, UserUpdateRequestSchema } from "./user.schema";

import z from "zod";

const c = initContract();

const lkContract = c.router({
  login: {
    method: "POST",
    path: "/id/:id/lk/login",
    pathParams: z.object({
      id: z.coerce.number().int(),
    }),
    body: z.object({
      username: z.string(),
      password: z.string(),
      saveCredentials: z.boolean().default(false),
    }),
    responses: {
      200: UserResponseSchema,
      401: z.string(),
      404: z.string(),
    },
  },
  logout: {
    method: "POST",
    path: "/id/:id/lk/logout",
    pathParams: z.object({
      id: z.coerce.number().int(),
    }),
    body: null,
    responses: {
      200: z.string(),
      404: z.string(),
    },
  },
});

export const userContract = c.router({
  getUser: {
    method: "GET",
    path: "/id/:id",
    pathParams: z.object({
      id: z.coerce.number().int(),
    }),
    responses: {
      200: UserResponseSchema,
      404: z.string(),
    },
  },
  getUserByTgId: {
    method: "GET",
    path: "/tgid/:id",
    pathParams: z.object({
      id: z.coerce.bigint(),
    }),
    responses: {
      200: UserResponseSchema.partial(),
      404: z.string(),
    },
  },
  deleteUser: {
    method: "DELETE",
    path: "/id/:id",
    pathParams: z.object({
      id: z.coerce.number().int(),
    }),
    responses: {
      200: z.string(),
      404: z.string(),
    },
  },
  updateUser: {
    method: "PUT",
    path: "/id/:id",
    pathParams: z.object({
      id: z.coerce.number().int(),
    }),
    body: UserUpdateRequestSchema.partial(),
    responses: {
      200: UserResponseSchema,
      404: z.string(),
    },
  },

  lk: lkContract,
});
