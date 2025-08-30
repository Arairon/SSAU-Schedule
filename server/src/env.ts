import { createEnv } from "@t3-oss/env-core";
import { configDotenv } from "dotenv";
import { z } from "zod";
configDotenv();

export const env = createEnv({
  server: {
    SCHED_BOT_TOKEN: z.string(),
    SCHED_BOT_DOMAIN: z.string(),
    SCHED_BOT_ADMIN_TGID: z.coerce.number().int().default(0),
    SCHED_DATABASE_URL: z.url(),
    SCHED_REDIS_URL: z.url(),
    SCHED_CREDENTIALS_KEY: z
      .string()
      .min(64, "The credentials key must be at least 64 characters long."),
    SCHED_PORT: z.coerce.number().int().default(3000),
    TZ: z.string().default("Europe/Samara"),
    LOG_LEVEL: z.string().toLowerCase().default("info"),
    FASTIFY_LOG_LEVEL: z.string().toLowerCase().optional().default("error"),
    NODE_ENV: z
      .enum(["development", "production"])
      .optional()
      .default("production"),
    PRISMA_LOGS: z.coerce.boolean().default(false),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: process.env,

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,
});
