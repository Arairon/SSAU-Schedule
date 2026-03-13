import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Multipart, MultipartFile } from "@fastify/multipart";
import { timingSafeEqual } from "node:crypto";

import { env } from "../env.js";
import { sendPhotoFromBuffer, sendPhotoFromUrl } from "../lib/telegram.js";
import {
  RelayBase64RequestSchema,
  RelayErrorResponseSchema,
  RelaySuccessResponseSchema,
  RelayUrlRequestSchema,
  relayContract,
} from "@ssau-schedule/contracts/v0/relay";

function isSafeImageMimeType(mimeType: string) {
  return RelayBase64RequestSchema.shape.mimeType.safeParse(mimeType).success;
}

function compareRelayKey(incoming: string) {
  const incomingBuffer = Buffer.from(incoming, "utf8");
  const expectedBuffer = Buffer.from(env.RELAY_KEY, "utf8");

  if (incomingBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(incomingBuffer, expectedBuffer);
}

function assertRelayKey(request: FastifyRequest) {
  const relayKey = request.headers["x-relay-key"];
  return typeof relayKey === "string" && compareRelayKey(relayKey);
}

function parseTarget(target: string) {
  const normalized = target.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error("target must be a numeric chat id");
  }

  return normalized;
}

async function verifyImageUrl(url: string) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https image urls are supported");
  }

  const headResponse = await fetch(parsed, {
    method: "HEAD",
    signal: AbortSignal.timeout(env.RELAY_REQUEST_TIMEOUT_MS),
  });

  if (!headResponse.ok) {
    throw new Error(
      `Image url check failed with status ${headResponse.status}`,
    );
  }

  const contentType = headResponse.headers.get("content-type");
  if (contentType && !contentType.toLowerCase().startsWith("image/")) {
    throw new Error("Image url does not look like an image resource");
  }
}

function getFieldValue(field: Multipart | Multipart[] | undefined) {
  const first = Array.isArray(field) ? field[0] : field;
  if (first?.type !== "field") {
    return null;
  }

  return typeof first.value === "string" ? first.value : null;
}

function getTargetFromMultipart(file: MultipartFile) {
  const target = getFieldValue(file.fields.target);
  if (typeof target !== "string") {
    throw new Error("Missing multipart field 'target'");
  }

  return parseTarget(target);
}

function validatePayloadSize(buffer: Buffer) {
  if (buffer.length > env.RELAY_MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Image size exceeds RELAY_MAX_FILE_SIZE_BYTES (${env.RELAY_MAX_FILE_SIZE_BYTES})`,
    );
  }
}

export async function registerSendRoutes(fastify: FastifyInstance) {
  fastify.get(relayContract.healthz.path, async () => ({ ok: true }));

  fastify.post(relayContract.sendFile.path, async (request, reply) => {
    if (!assertRelayKey(request)) {
      return reply
        .status(401)
        .send(
          RelayErrorResponseSchema.parse({ ok: false, error: "Unauthorized" }),
        );
    }

    let file: MultipartFile | undefined;
    try {
      file = await request.file();
      if (!file) {
        return reply.status(400).send(
          RelayErrorResponseSchema.parse({
            ok: false,
            error: "No image file provided",
          }),
        );
      }

      const target = getTargetFromMultipart(file);
      if (!isSafeImageMimeType(file.mimetype)) {
        return reply.status(400).send(
          RelayErrorResponseSchema.parse({
            ok: false,
            error: "Unsupported image mime type",
          }),
        );
      }

      const imageBuffer = await file.toBuffer();
      validatePayloadSize(imageBuffer);

      const sent = await sendPhotoFromBuffer({
        token: env.SCHED_BOT_TOKEN,
        target,
        image: imageBuffer,
        mimeType: file.mimetype,
        filename: file.filename || "image.jpg",
        timeoutMs: env.RELAY_REQUEST_TIMEOUT_MS,
      });

      return reply.send(
        RelaySuccessResponseSchema.parse({ ok: true, fileId: sent.fileId }),
      );
    } catch (error) {
      request.log.error({ err: error }, "Failed to relay multipart image");
      return reply.status(400).send(
        RelayErrorResponseSchema.parse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Invalid multipart request",
        }),
      );
    } finally {
      if (file) {
        file.file.resume();
      }
    }
  });

  fastify.post<{ Body: unknown }>(
    relayContract.sendBase64.path,
    async (request, reply) => {
      if (!assertRelayKey(request)) {
        return reply
          .status(401)
          .send(
            RelayErrorResponseSchema.parse({
              ok: false,
              error: "Unauthorized",
            }),
          );
      }

      const parsed = RelayBase64RequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(
          RelayErrorResponseSchema.parse({
            ok: false,
            error: parsed.error.message,
          }),
        );
      }

      try {
        const target = parseTarget(parsed.data.target);
        const imageBuffer = Buffer.from(parsed.data.data, "base64");
        if (imageBuffer.length === 0) {
          throw new Error("base64 payload produced an empty buffer");
        }
        validatePayloadSize(imageBuffer);

        const sent = await sendPhotoFromBuffer({
          token: env.SCHED_BOT_TOKEN,
          target,
          image: imageBuffer,
          mimeType: parsed.data.mimeType,
          filename: parsed.data.filename,
          timeoutMs: env.RELAY_REQUEST_TIMEOUT_MS,
        });

        return reply.send(
          RelaySuccessResponseSchema.parse({ ok: true, fileId: sent.fileId }),
        );
      } catch (error) {
        request.log.error({ err: error }, "Failed to relay base64 image");
        return reply.status(400).send(
          RelayErrorResponseSchema.parse({
            ok: false,
            error:
              error instanceof Error ? error.message : "Invalid base64 request",
          }),
        );
      }
    },
  );

  fastify.post<{ Body: unknown }>(
    relayContract.sendUrl.path,
    async (request, reply) => {
      if (!assertRelayKey(request)) {
        return reply
          .status(401)
          .send(
            RelayErrorResponseSchema.parse({
              ok: false,
              error: "Unauthorized",
            }),
          );
      }

      const parsed = RelayUrlRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(
          RelayErrorResponseSchema.parse({
            ok: false,
            error: parsed.error.message,
          }),
        );
      }

      try {
        const target = parseTarget(parsed.data.target);
        await verifyImageUrl(parsed.data.url);

        const sent = await sendPhotoFromUrl({
          token: env.SCHED_BOT_TOKEN,
          target,
          imageUrl: parsed.data.url,
          timeoutMs: env.RELAY_REQUEST_TIMEOUT_MS,
        });

        return reply.send(
          RelaySuccessResponseSchema.parse({ ok: true, fileId: sent.fileId }),
        );
      } catch (error) {
        request.log.error({ err: error }, "Failed to relay image by url");
        return reply.status(400).send(
          RelayErrorResponseSchema.parse({
            ok: false,
            error:
              error instanceof Error ? error.message : "Invalid url request",
          }),
        );
      }
    },
  );
}
