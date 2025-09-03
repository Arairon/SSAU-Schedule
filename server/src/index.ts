import fastify from "fastify";
import fastifySchedule from "@fastify/schedule";
import { env } from "./env";
import log from "./logger";
import userRoutes from "./api/user";
// import init_redis from "./redis";
import init_bot from "./bot/bot";
import { intervaljobs, cronjobs } from "./lib/tasks";

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
    server.bot.stop("SIGINT");
  });

  process.once("SIGTERM", () => {
    void server.close();
    server.bot.stop("SIGTERM");
  });
}
void start();
