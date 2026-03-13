import fastify from "fastify";
import multipart from "@fastify/multipart";
import { env } from "./env.js";
import { registerSendRoutes } from "./routes/send.js";

const server = fastify({
  logger: {
    level: env.LOG_LEVEL,
  },
});

async function start() {
  await server.register(multipart, {
    limits: {
      fileSize: env.RELAY_MAX_FILE_SIZE_BYTES,
      files: 1,
      parts: 8,
    },
  });

  await registerSendRoutes(server);

  await server.listen({
    host: env.RELAY_HOST,
    port: env.RELAY_PORT,
  });
}

void start().catch((error) => {
  server.log.error({ err: error }, "Unable to start telegram relay app");
  process.exit(1);
});
