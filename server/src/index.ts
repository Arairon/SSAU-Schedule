import fastify from "fastify";
import fastifySchedule from "@fastify/schedule";
import { env } from "./env";
import log from "./logger";
import userRoutes from "./api/user";
import tgUserRoutes from "./api/userTg";
// import init_redis from "./redis";
import init_bot from "./bot/bot";
import { intervaljobs, cronjobs } from "./lib/tasks";
import { routesv0 } from "./api/v0/routes";

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
  server.register(tgUserRoutes);
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
