import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Multipart, MultipartFile } from "@fastify/multipart";
import { z } from "zod";
import { sendPhotoFromBuffer, sendPhotoFromUrl } from "../lib/telegram.js";
import { env } from "../env.js";
import { timingSafeEqual } from "node:crypto";

const ImageMimeTypeSchema = z
  .string()
  .regex(/^image\/(png|jpe?g|webp|gif)$/i, "Unsupported image mime type");

const Base64BodySchema = z.object({
  target: z.coerce.string().trim().min(1),
  data: z.string().trim().min(1),
  mimeType: ImageMimeTypeSchema,
  filename: z.string().trim().min(1).default("image.jpg"),
});

const UrlBodySchema = z.object({
  target: z.coerce.string().trim().min(1),
  url: z.url(),
});

type RelaySendResponse = {
  ok: true;
  fileId: string;
};

function isSafeImageMimeType(mimeType: string) {
  return ImageMimeTypeSchema.safeParse(mimeType).success;
}

function compareRelayKey(incoming: string) {
  const incomingBuffer = Buffer.from(incoming, "utf8");
  const expectedBuffer = Buffer.from(env.RELAY_KEY, "utf8");

  if (incomingBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(incomingBuffer, expectedBuffer);
}

function assertRelayKey(request: FastifyRequest, reply: FastifyReply) {
  const relayKey = request.headers["x-relay-key"];
  if (typeof relayKey !== "string" || !compareRelayKey(relayKey)) {
    void reply.status(401).send({ ok: false, error: "Unauthorized" });
    return false;
  }

  return true;
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
  fastify.get("/healthz", async () => ({ ok: true }));

  fastify.post("/send/file", async (request, reply) => {
    if (!assertRelayKey(request, reply)) return;

    let file: MultipartFile | undefined;
    try {
      file = await request.file();
      if (!file) {
        return reply
          .status(400)
          .send({ ok: false, error: "No image file provided" });
      }

      const target = getTargetFromMultipart(file);
      if (!isSafeImageMimeType(file.mimetype)) {
        return reply
          .status(400)
          .send({ ok: false, error: "Unsupported image mime type" });
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

      return reply.send({
        ok: true,
        fileId: sent.fileId,
      } satisfies RelaySendResponse);
    } catch (error) {
      request.log.error({ err: error }, "Failed to relay multipart image");
      return reply.status(400).send({
        ok: false,
        error:
          error instanceof Error ? error.message : "Invalid multipart request",
      });
    } finally {
      if (file) {
        file.file.resume();
      }
    }
  });

  fastify.post<{ Body: unknown }>("/send/base64", async (request, reply) => {
    if (!assertRelayKey(request, reply)) return;

    const parsed = Base64BodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.message });
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

      return reply.send({
        ok: true,
        fileId: sent.fileId,
      } satisfies RelaySendResponse);
    } catch (error) {
      request.log.error({ err: error }, "Failed to relay base64 image");
      return reply.status(400).send({
        ok: false,
        error:
          error instanceof Error ? error.message : "Invalid base64 request",
      });
    }
  });

  fastify.post<{ Body: unknown }>("/send/url", async (request, reply) => {
    if (!assertRelayKey(request, reply)) return;

    const parsed = UrlBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.message });
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

      return reply.send({
        ok: true,
        fileId: sent.fileId,
      } satisfies RelaySendResponse);
    } catch (error) {
      request.log.error({ err: error }, "Failed to relay image by url");
      return reply.status(400).send({
        ok: false,
        error: error instanceof Error ? error.message : "Invalid url request",
      });
    }
  });
}
