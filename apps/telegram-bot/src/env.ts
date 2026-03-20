import { createEnv } from "@t3-oss/env-core";
import { configDotenv } from "dotenv";
import { z } from "zod";

configDotenv();

export const env = createEnv({
  server: {
    SCHED_BOT_TOKEN: z.string(),
    SCHED_BOT_INTERNAL_API_URL: z.url(),
    SCHED_BOT_INTERNAL_API_SECRET: z
      .string()
      .min(64, "The internal API secret must be at least 64 characters long"),
    SCHED_BOT_PORT: z.coerce.number().int().default(3040),
    SCHED_BOT_HOST: z.string().default("0.0.0.0"),
    LOG_LEVEL: z.string().toLowerCase().default("info"),
    NODE_ENV: z
      .enum(["development", "production"])
      .optional()
      .default("production"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
