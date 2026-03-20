import { createEnv } from "@t3-oss/env-core";
import { configDotenv } from "dotenv";
import { z } from "zod";

configDotenv();

export const env = createEnv({
  server: {
    SCHED_BOT_TOKEN: z.string(),
    SCHED_BOT_DOMAIN: z.string(),
    SCHED_BOT_IMAGE_DUMP_CHATID: z
      .string()
      .min(
        1,
        "SCHED_BOT_IMAGE_DUMP_CHATID is required to send images. Create a private group chat with your bot and put its chat ID here.",
      ),
    SCHED_BOT_ADMIN_TGID: z.coerce.number().int().default(0),
    SCHED_BOT_ADMIN_CONTACT: z.string().default("[Администратор не задан]"),
    SCHED_BOT_INTERNAL_API_URL: z.url(),
    SCHED_BOT_INTERNAL_API_SECRET: z
      .string()
      .min(64, "The internal API secret must be at least 64 characters long"),
    SCHED_BOT_PORT: z.coerce.number().int().default(3040),
    SCHED_BOT_HOST: z.string().default("0.0.0.0"),
    SCHED_BOT_IMAGE_UPLOAD_MODE: z
      .enum(["file", "url", "relay"])
      .default("file"),
    SCHED_BOT_IMAGE_RELAY_URL: z.url().optional(),
    SCHED_BOT_IMAGE_RELAY_KEY: z.string().optional(),
    SCHED_BOT_IMAGE_RELAY_PROTECTION_BYPASS: z.string().optional(),
    SCHED_BOT_IMAGE_RELAY_TIMEOUT_MS: z.coerce
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
