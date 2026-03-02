import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

export const ApiKeyInfoSchema = z.object({
  id: z.number(),
  userId: z.number(),
  publicPart: z.string(),
  keyHash: z.string(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  revoked: z.boolean(),
});

export const NewApiKeyResponseSchema = z.object({
  key: z.string(),
  info: ApiKeyInfoSchema,
});

export const CheckApiKeyResponseSchema = z.union([
  z.boolean(),
  z.null(),
  ApiKeyInfoSchema,
  ApiKeyInfoSchema.extend({ user: z.unknown() }),
]);

export const apiKeyContract = c.router({
  create: {
    method: "GET",
    path: "/new",
    responses: {
      200: NewApiKeyResponseSchema,
      403: z.string(),
    },
  },
  check: {
    method: "GET",
    path: "/check/:key",
    pathParams: z.object({
      key: z.string(),
    }),
    responses: {
      200: CheckApiKeyResponseSchema,
    },
  },
  list: {
    method: "GET",
    path: "/list",
    responses: {
      200: z.array(ApiKeyInfoSchema),
      403: z.string(),
    },
  },
  revoke: {
    method: "DELETE",
    path: "/:keyId",
    pathParams: z.object({
      keyId: z.coerce.number(),
    }),
    responses: {
      200: z.boolean(),
      403: z.string(),
    },
  },
});
