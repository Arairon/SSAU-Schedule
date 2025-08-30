import fastify, { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./env";
import log from "./logger";
import userRoutes from "./api/user";
// import init_redis from "./redis";
import init_bot from "./bot";

const server = fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        ignore: "pid,hostname",
      },
    },
    level: env.FASTIFY_LOG_LEVEL ?? env.LOG_LEVEL,
  },
});

async function start() {
  // await init_redis(server);
  await init_bot(server);
  server.register(userRoutes);
  server.listen({ port: env.SCHED_PORT }, (err, addr) => {
    if (err) {
      log.error(err);
      process.exit(1);
    }
    log.info(`Server listening at ${addr}`);
  });

  process.once("SIGINT", () => {
    server.close();
    server.bot.stop("SIGINT");
  });

  process.once("SIGTERM", () => {
    server.close();
    server.bot.stop("SIGTERM");
  });
}
start();
