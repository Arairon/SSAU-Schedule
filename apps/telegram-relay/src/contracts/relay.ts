import { z } from "zod";

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

export const relayContract = {
  sendFile: {
    path: "/send/file",
  },
  sendBase64: {
    path: "/send/base64",
  },
  sendUrl: {
    path: "/send/url",
  },
  healthz: {
    path: "/healthz",
  },
} as const;

export type RelaySuccessResponse = z.infer<typeof RelaySuccessResponseSchema>;
export type RelayErrorResponse = z.infer<typeof RelayErrorResponseSchema>;
