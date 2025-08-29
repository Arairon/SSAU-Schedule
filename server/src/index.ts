import fastify, { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./env";
import log from "./logger";
import userRoutes from "./api/user";

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

server.register(userRoutes);

server.get("/", (req, res) => {
  res.status(200).send("Hi!");
});

server.listen({ port: env.SCHED_PORT }, (err, addr) => {
  if (err) {
    log.error(err);
    process.exit(1);
  }
  log.info(`Server listening at ${addr}`);
});
