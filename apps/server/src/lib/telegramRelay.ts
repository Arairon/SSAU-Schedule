import { env } from "@/env";
import { initClient } from "@ts-rest/core";
import {
  RelayErrorResponseSchema,
  RelaySuccessResponseSchema,
  relayContract,
} from "@ssau-schedule/contracts/v0/relay";
import log from "@/logger";

type RelayResult = {
  fileId: string;
};

function isLocalRelayHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function getRelayConfig() {
  const baseRaw = env.SCHED_BOT_IMAGE_RELAY_URL;
  if (typeof baseRaw !== "string" || baseRaw.length === 0) {
    return null;
  }

  const parsedBase = new URL(baseRaw);
  if (
    parsedBase.protocol !== "https:" &&
    !isLocalRelayHost(parsedBase.hostname)
  ) {
    throw new Error(
      "SCHED_BOT_IMAGE_RELAY_URL must use https for non-local relay hosts",
    );
  }

  const relayKeyRaw = env.SCHED_BOT_IMAGE_RELAY_KEY;
  if (typeof relayKeyRaw !== "string" || relayKeyRaw.length === 0) {
    return null;
  }

  return {
    baseUrl: baseRaw,
    relayKey: relayKeyRaw,
    telegramToken: env.SCHED_BOT_TOKEN,
  } as const;
}

function getRelayTimeoutMs() {
  return Number(env.SCHED_BOT_IMAGE_RELAY_TIMEOUT_MS);
}

const relayConfig = getRelayConfig();

const relayClient = relayConfig
  ? initClient(relayContract, {
      baseUrl: relayConfig.baseUrl,
      baseHeaders: {
        "x-relay-key": relayConfig.relayKey,
        "x-telegram-token": relayConfig.telegramToken,
        ...(env.NODE_ENV === "development" &&
        env.SCHED_BOT_IMAGE_RELAY_PROTECTION_BYPASS
          ? {
              "x-vercel-protection-bypass":
                env.SCHED_BOT_IMAGE_RELAY_PROTECTION_BYPASS,
            }
          : {}),
      },
      credentials: "omit",
      validateResponse: true,
      throwOnUnknownStatus: true,
    })
  : null;

function getRelayClient() {
  if (!relayClient) {
    throw new Error(
      "Relay client is not configured: set SCHED_BOT_IMAGE_RELAY_URL and SCHED_BOT_IMAGE_RELAY_KEY",
    );
  }

  return relayClient;
}

function ensureRelaySuccessResponse(response: {
  status: number;
  body: unknown;
}): RelayResult {
  if (response.status === 200) {
    const parsed = RelaySuccessResponseSchema.safeParse(response.body);
    if (parsed.success) {
      return { fileId: parsed.data.fileId };
    }
  }

  const parsedError = RelayErrorResponseSchema.safeParse(response.body);
  if (parsedError.success) {
    throw new Error(
      `Relay request failed (${response.status}): ${parsedError.data.error}`,
    );
  }

  throw new Error(`Relay request failed (${response.status}): unknown error`);
}

async function withRelayRetry<T extends { status: number; body: unknown }>(
  fn: () => Promise<T>,
  { maxRetries, timeoutMs }: { maxRetries: number; timeoutMs: number },
): Promise<T> {
  let response = await fn();
  for (
    let attempt = 0;
    attempt < maxRetries && response.status === 429;
    attempt++
  ) {
    const parsed = RelayErrorResponseSchema.safeParse(response.body);
    const retryAfterMs =
      parsed.success && typeof parsed.data.retry_after === "number"
        ? Math.max(parsed.data.retry_after * 1000, timeoutMs)
        : timeoutMs;
    log.warn(
      `Relay request rate limited (attempt ${attempt + 1}/${maxRetries}). Will retry after ${retryAfterMs}ms.`,
    );
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    response = await fn();
  }
  return response;
}

export async function relayImageByFile(opts: {
  target: string;
  image: Buffer;
  mimeType: string;
  filename?: string;
  caption?: string;
  maxRetries?: number;
  retryTimeoutMs?: number;
}) {
  const form = new FormData();
  form.append("target", opts.target);
  form.append(
    "image",
    new Blob([new Uint8Array(opts.image)], { type: opts.mimeType }),
    opts.filename ?? "schedule.jpg",
  );

  const response = await withRelayRetry(
    () =>
      getRelayClient().sendFile({
        body: form,
        query: {
          caption: opts.caption,
        },
        fetchOptions: {
          signal: AbortSignal.timeout(getRelayTimeoutMs()),
        },
      }),
    {
      maxRetries: opts.maxRetries ?? 3,
      timeoutMs: opts.retryTimeoutMs ?? 10_000,
    },
  );

  return ensureRelaySuccessResponse(response);
}

export async function relayImageByBase64(opts: {
  target: string;
  imageBase64: string;
  mimeType: string;
  filename?: string;
  caption?: string;
  maxRetries?: number;
  retryTimeoutMs?: number;
}) {
  const response = await withRelayRetry(
    () =>
      getRelayClient().sendBase64({
        query: {
          caption: opts.caption,
        },
        body: {
          target: opts.target,
          data: opts.imageBase64,
          mimeType: opts.mimeType,
          filename: opts.filename ?? "schedule.jpg",
        },
        fetchOptions: {
          signal: AbortSignal.timeout(getRelayTimeoutMs()),
        },
      }),
    {
      maxRetries: opts.maxRetries ?? 3,
      timeoutMs: opts.retryTimeoutMs ?? 10_000,
    },
  );

  return ensureRelaySuccessResponse(response);
}

export async function relayImageByUrl(opts: {
  target: string;
  url: string;
  caption?: string;
  maxRetries?: number;
  retryTimeoutMs?: number;
}) {
  const response = await withRelayRetry(
    () =>
      getRelayClient().sendUrl({
        query: {
          caption: opts.caption,
        },
        body: {
          target: opts.target,
          url: opts.url,
        },
        fetchOptions: {
          signal: AbortSignal.timeout(getRelayTimeoutMs()),
        },
      }),
    {
      maxRetries: opts.maxRetries ?? 3,
      timeoutMs: opts.retryTimeoutMs ?? 10_000,
    },
  );

  return ensureRelaySuccessResponse(response);
}
