// import { type FastifyInstance } from "fastify";
// import redis from "@fastify/redis";
// import { env } from "./env";
// import log from "./logger";

// async function init(fastify: FastifyInstance) {
//   const REDIS_URL = env.SCHED_REDIS_URL;

//   log.debug("Registering redis..");

//   await fastify.register(redis, {
//     url: REDIS_URL,
//   });

//   log.debug(`Redis connected to ${REDIS_URL}`);

//   return fastify;
// }

// export default init;
