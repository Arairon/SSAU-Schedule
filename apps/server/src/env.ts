import { createEnv } from "@t3-oss/env-core";
import { configDotenv } from "dotenv";
import { z } from "zod";

configDotenv({ quiet: true });

export const env = createEnv({
  server: {
    SCHED_BOT_TOKEN: z.string(), // Used for miniapp
    SCHED_SERVER_DOMAIN: z.string(),
    // SCHED_BOT_IMAGE_DUMP_CHATID: z
    //   .string()
    //   .min(
    //     1,
    //     "SCHED_BOT_IMAGE_DUMP_CHATID is required to send images. Create a private group chat with your bot and put its chat ID here.",
    //   ),
    // SCHED_BOT_IMAGE_UPLOAD_MODE: z
    //   .enum(["file", "url", "relay"])
    //   .default("file"),
    // SCHED_BOT_IMAGE_RELAY_URL: z.url().optional(),
    // SCHED_BOT_IMAGE_RELAY_KEY: z.string().optional(),
    // SCHED_BOT_IMAGE_RELAY_PROTECTION_BYPASS: z.string().optional(),
    // SCHED_BOT_IMAGE_RELAY_TIMEOUT_MS: z.coerce
    //   .number()
    //   .int()
    //   .positive()
    //   .default(10_000),
    SCHED_BOT_ADMIN_TGID: z.coerce.number().int().default(0),
    SCHED_BOT_ADMIN_CONTACT: z.string().default("[Администратор не задан]"),
    SCHED_SERVER_DATABASE_URL: z.url(),
    // SCHED_REDIS_URL: z.url(),
    SCHED_SERVER_CREDENTIALS_KEY: z
      .string()
      .min(64, "The credentials key must be at least 64 characters long"),
    SCHED_SERVER_JWT_SECRET: z
      .string()
      .min(64, "The JWT secret must be at least 64 characters long"), // Also used as cookie secret
    SCHED_SERVER_INTERNAL_API_SECRET: z
      .string()
      .min(64, "The internal API secret must be at least 64 characters long"),
    SCHED_BOT_DISPATCH_URL: z.url(),
    // SCHED_BOT_PROXY_URL: z.url().optional(),
    // SCHED_BOT_PROXY_TYPE: z.enum(["socks", "https"]).optional(),
    // SCHED_BOT_USE_WEBHOOK: z
    //   .string()
    //   .transform((val) => ["true", "1"].includes(val.trim().toLowerCase()))
    //   .default(false),
    // SCHED_BOT_WEBHOOK_PATH: z.string().default("/api/bot/webhook"),
    // SCHED_BOT_WEBHOOK_URL: z.url().optional(),
    // SCHED_BOT_WEBHOOK_SECRET: z.string().optional(),
    SCHED_SERVER_PORT: z.coerce.number().int().default(3000),
    SCHED_SERVER_HOST: z.string().default("0.0.0.0"),
    SCHED_SERVER_CHROME_PATH: z.string().optional(),
    LOG_LEVEL: z.string().toLowerCase().default("info"),
    TZ: z.string().default("Europe/Samara"),
    NODE_ENV: z
      .enum(["development", "production"])
      .optional()
      .default("production"),
    PRISMA_LOGS: z
      .string()
      .transform((val) => ["true", "1"].includes(val.trim().toLowerCase()))
      .default(false),
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

// if (env.SCHED_BOT_IMAGE_UPLOAD_MODE === "relay") {
//   if (!env.SCHED_BOT_IMAGE_DUMP_CHATID) {
//     throw new Error(
//       "SCHED_BOT_IMAGE_DUMP_CHATID is required when SCHED_BOT_IMAGE_UPLOAD_MODE=relay",
//     );
//   }

//   if (!env.SCHED_BOT_IMAGE_RELAY_URL) {
//     throw new Error(
//       "SCHED_BOT_IMAGE_RELAY_URL is required when SCHED_BOT_IMAGE_UPLOAD_MODE=relay",
//     );
//   }

//   if (!env.SCHED_BOT_IMAGE_RELAY_KEY) {
//     throw new Error(
//       "SCHED_BOT_IMAGE_RELAY_KEY is required when SCHED_BOT_IMAGE_UPLOAD_MODE=relay",
//     );
//   }
// }

// if (env.SCHED_BOT_PROXY_TYPE && !env.SCHED_BOT_PROXY_URL) {
//   throw new Error(
//     "SCHED_BOT_PROXY_URL is required when SCHED_BOT_PROXY_TYPE is set",
//   );
// }

// if (env.SCHED_BOT_USE_WEBHOOK && !env.SCHED_BOT_WEBHOOK_PATH.startsWith("/")) {
//   throw new Error("SCHED_BOT_WEBHOOK_PATH must start with '/'");
// }
