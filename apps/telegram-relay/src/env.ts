import { createEnv } from "@t3-oss/env-core";
import { configDotenv } from "dotenv";
import { z } from "zod";

configDotenv();

export const env = createEnv({
  server: {
    RELAY_KEY: z.string().min(16),
    RELAY_HOST: z.string().default("0.0.0.0"),
    RELAY_PORT: z.coerce.number().int().positive().default(3020),
    RELAY_MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    RELAY_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10_000),
    LOG_LEVEL: z.string().toLowerCase().default("info"),
    NODE_ENV: z
      .enum(["development", "production"])
      .optional()
      .default("production"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
