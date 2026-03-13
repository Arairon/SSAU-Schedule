import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

const NumericTargetSchema = z
  .string()
  .trim()
  .regex(/^-?\d+$/, "target must be a numeric chat id");

const ImageMimeTypeSchema = z
  .string()
  .regex(/^image\/(png|jpe?g|webp|gif)$/i, "Unsupported image mime type");

export const RelayBase64RequestSchema = z.object({
  target: NumericTargetSchema,
  data: z.string().trim().min(1),
  mimeType: ImageMimeTypeSchema,
  filename: z.string().trim().min(1).default("image.jpg"),
});

export const RelayUrlRequestSchema = z.object({
  target: NumericTargetSchema,
  url: z.url(),
});

export const RelaySuccessResponseSchema = z.object({
  ok: z.literal(true),
  fileId: z.string().min(1),
});

export const RelayErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export const relayContract = c.router({
  sendFile: {
    method: "POST",
    path: "/send/file",
    contentType: "multipart/form-data",
    body: z.any(),
    responses: {
      200: RelaySuccessResponseSchema,
      400: RelayErrorResponseSchema,
      401: RelayErrorResponseSchema,
      500: RelayErrorResponseSchema,
    },
  },
  sendBase64: {
    method: "POST",
    path: "/send/base64",
    body: RelayBase64RequestSchema,
    responses: {
      200: RelaySuccessResponseSchema,
      400: RelayErrorResponseSchema,
      401: RelayErrorResponseSchema,
      500: RelayErrorResponseSchema,
    },
  },
  sendUrl: {
    method: "POST",
    path: "/send/url",
    body: RelayUrlRequestSchema,
    responses: {
      200: RelaySuccessResponseSchema,
      400: RelayErrorResponseSchema,
      401: RelayErrorResponseSchema,
      500: RelayErrorResponseSchema,
    },
  },
  healthz: {
    method: "GET",
    path: "/healthz",
    responses: {
      200: z.object({ ok: z.literal(true) }),
    },
  },
});

export type RelaySuccessResponse = z.infer<typeof RelaySuccessResponseSchema>;
export type RelayErrorResponse = z.infer<typeof RelayErrorResponseSchema>;
