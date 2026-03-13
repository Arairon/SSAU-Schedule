import { env } from "@/env";
import { initClient } from "@ts-rest/core";
import {
  RelayErrorResponseSchema,
  RelaySuccessResponseSchema,
  relayContract,
} from "@ssau-schedule/contracts/v0/relay";

type RelayResult = {
  fileId: string;
};

function getRelayConfig() {
  const baseRaw = env.SCHED_BOT_IMAGE_RELAY_URL;
  if (typeof baseRaw !== "string" || baseRaw.length === 0) {
    return null;
  }

  const relayKeyRaw = env.SCHED_BOT_IMAGE_RELAY_KEY;
  if (typeof relayKeyRaw !== "string" || relayKeyRaw.length === 0) {
    return null;
  }

  return {
    baseUrl: baseRaw,
    relayKey: relayKeyRaw,
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

export async function relayImageByFile(opts: {
  target: string;
  image: Buffer;
  mimeType: string;
  filename?: string;
}) {
  const form = new FormData();
  form.append("target", opts.target);
  form.append(
    "image",
    new Blob([new Uint8Array(opts.image)], { type: opts.mimeType }),
    opts.filename ?? "schedule.jpg",
  );

  const response = await getRelayClient().sendFile({
    body: form,
    fetchOptions: {
      signal: AbortSignal.timeout(getRelayTimeoutMs()),
    },
  });

  return ensureRelaySuccessResponse(response);
}

export async function relayImageByBase64(opts: {
  target: string;
  imageBase64: string;
  mimeType: string;
  filename?: string;
}) {
  const response = await getRelayClient().sendBase64({
    body: {
      target: opts.target,
      data: opts.imageBase64,
      mimeType: opts.mimeType,
      filename: opts.filename ?? "schedule.jpg",
    },
    fetchOptions: {
      signal: AbortSignal.timeout(getRelayTimeoutMs()),
    },
  });

  return ensureRelaySuccessResponse(response);
}

export async function relayImageByUrl(opts: { target: string; url: string }) {
  const response = await getRelayClient().sendUrl({
    body: {
      target: opts.target,
      url: opts.url,
    },
    fetchOptions: {
      signal: AbortSignal.timeout(getRelayTimeoutMs()),
    },
  });

  return ensureRelaySuccessResponse(response);
}
