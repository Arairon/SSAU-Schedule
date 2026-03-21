import { createEnv } from "@t3-oss/env-core";
import { configDotenv } from "dotenv";
import { z } from "zod";

configDotenv();

export const env = createEnv({
  server: {
    SCHED_BOT_TOKEN: z.string(),

    SCHED_BOT_DOMAIN: z
      .string()
      .describe(
        "Domain where the bot is hosted, without protocol or trailing slash. Used for webhooks",
      ),
    SCHED_APP_DOMAIN: z
      .string()
      .describe(
        "Domain where the app is hosted, without protocol or trailing slash. Used to links to the app from the bot",
      ),
    SCHED_SERVER_DOMAIN: z
      .string()
      .describe(
        "Domain where the server is hosted, without protocol or trailing slash. Used for links and ics",
      ),

    SCHED_BOT_IMAGE_DUMP_CHATID: z
      .string()
      .min(
        1,
        "SCHED_BOT_IMAGE_DUMP_CHATID is required to send images. Create a private group chat with your bot and put its chat ID here.",
      ),
    SCHED_BOT_ADMIN_TGID: z.coerce.number().int().default(0),
    SCHED_BOT_ADMIN_CONTACT: z.string().default("[Администратор не задан]"),

    SCHED_SERVER_INTERNAL_API_URL: z.url(),
    SCHED_SERVER_INTERNAL_API_SECRET: z
      .string()
      .min(64, "The internal API secret must be at least 64 characters long"),

    SCHED_BOT_PORT: z.coerce.number().int().default(3002),
    SCHED_BOT_HOST: z.string().default("0.0.0.0"),

    SCHED_BOT_TLS_CERT: z
      .string()
      .optional()
      .describe("TLS certificate PEM content or file path"),
    SCHED_BOT_TLS_KEY: z
      .string()
      .optional()
      .describe("TLS private key PEM content or file path"),

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

    SCHED_BOT_PROXY_URL: z.url().optional(),
    SCHED_BOT_PROXY_TYPE: z.enum(["socks", "https"]).optional(),

    SCHED_BOT_USE_WEBHOOK: z
      .string()
      .transform((val) => ["true", "1"].includes(val.trim().toLowerCase()))
      .default(false),
    SCHED_BOT_WEBHOOK_PATH: z.string().default("/api/bot/webhook"),
    SCHED_BOT_WEBHOOK_URL: z.url().optional(),
    SCHED_BOT_WEBHOOK_SECRET: z.string().optional(),

    LOG_LEVEL: z.string().toLowerCase().default("info"),
    NODE_ENV: z
      .enum(["development", "production"])
      .optional()
      .default("production"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

if (env.SCHED_BOT_IMAGE_UPLOAD_MODE === "relay") {
  if (!env.SCHED_BOT_IMAGE_DUMP_CHATID) {
    throw new Error(
      "SCHED_BOT_IMAGE_DUMP_CHATID is required when SCHED_BOT_IMAGE_UPLOAD_MODE=relay",
    );
  }

  if (!env.SCHED_BOT_IMAGE_RELAY_URL) {
    throw new Error(
      "SCHED_BOT_IMAGE_RELAY_URL is required when SCHED_BOT_IMAGE_UPLOAD_MODE=relay",
    );
  }

  if (!env.SCHED_BOT_IMAGE_RELAY_KEY) {
    throw new Error(
      "SCHED_BOT_IMAGE_RELAY_KEY is required when SCHED_BOT_IMAGE_UPLOAD_MODE=relay",
    );
  }
}

if (env.SCHED_BOT_PROXY_TYPE && !env.SCHED_BOT_PROXY_URL) {
  throw new Error(
    "SCHED_BOT_PROXY_URL is required when SCHED_BOT_PROXY_TYPE is set",
  );
}

if (env.SCHED_BOT_USE_WEBHOOK && !env.SCHED_BOT_WEBHOOK_PATH.startsWith("/")) {
  throw new Error("SCHED_BOT_WEBHOOK_PATH must start with '/'");
}

if (
  (env.SCHED_BOT_TLS_CERT && !env.SCHED_BOT_TLS_KEY) ||
  (!env.SCHED_BOT_TLS_CERT && env.SCHED_BOT_TLS_KEY)
) {
  throw new Error(
    "SCHED_BOT_TLS_CERT and SCHED_BOT_TLS_KEY must be provided together",
  );
}
