import fastify from "fastify";
import fastifySchedule from "@fastify/schedule";
import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import { env } from "./env";
import log from "./logger";
// import init_redis from "./redis";
import init_bot from "./bot/bot";
import { intervaljobs, cronjobs } from "./lib/tasks";
import { routesv0 } from "./api/v0/routes";
import { routesDebug } from "./api/debug/routes";
import path from "node:path";

// TODO: Automatic notifications rescheduling

const server = fastify({
  logger:
    env.NODE_ENV === "development"
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              ignore: "pid,hostname",
            },
          },
          level: env.FASTIFY_LOG_LEVEL ?? env.LOG_LEVEL,
        }
      : {
          level: env.FASTIFY_LOG_LEVEL ?? env.LOG_LEVEL,
        },
});

async function start() {
  // await init_redis(server);
  await init_bot(server);

  await server.register(cors, {
    origin: env.SCHED_HOST,
    credentials: true,
  });

  server.register(routesv0, { prefix: "/api/v0" });
  if (env.NODE_ENV === "development")
    server.register(routesDebug, { prefix: "/api/debug" });

  server.register(fastifyStatic, {
    root:
      env.NODE_ENV === "development"
        ? path.resolve("../client/dist")
        : path.resolve("/app/public"),
  });

  server.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) {
      return reply.code(404).send({ message: "Not Found" });
    }
    reply.sendFile("index.html");
  });

  server.register(fastifySchedule);

  server.ready().then(() => {
    for (const job of intervaljobs) server.scheduler.addIntervalJob(job);
    for (const job of cronjobs) server.scheduler.addCronJob(job);
  });

  server.listen({ port: env.SCHED_PORT, host: env.SCHED_HOST }, (err, addr) => {
    if (err) {
      log.error(err);
      process.exit(1);
    }
    log.info(`Server listening at ${addr}`);
  });

  process.once("SIGINT", () => {
    void server.close();
    void server.botHandle.stop();
  });

  process.once("SIGTERM", () => {
    void server.close();
    void server.botHandle.stop();
  });
}
void start();
