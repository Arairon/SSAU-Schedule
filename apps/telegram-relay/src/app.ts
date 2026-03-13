import fastify from "fastify";
import multipart from "@fastify/multipart";

import { env } from "./env.js";
import { registerSendRoutes } from "./routes/send.js";

export async function buildRelayApp() {
  const app = fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: [
        "req.headers.x-relay-key",
        "req.headers.x-telegram-token",
        "headers.x-relay-key",
        "headers.x-telegram-token",
      ],
    },
  });

  await app.register(multipart, {
    limits: {
      fileSize: env.RELAY_MAX_FILE_SIZE_BYTES,
      files: 1,
      parts: 8,
    },
  });

  await registerSendRoutes(app);
  return app;
}
