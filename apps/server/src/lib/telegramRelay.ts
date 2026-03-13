import { env } from "@/env";

type RelaySendResponse = {
  ok: boolean;
  fileId?: string;
  error?: string;
};

type RelayResult = {
  fileId: string;
};

function getRelayUrl(path: string) {
  const baseRaw = env.SCHED_BOT_IMAGE_RELAY_URL;
  if (typeof baseRaw !== "string" || baseRaw.length === 0) {
    throw new Error("SCHED_BOT_IMAGE_RELAY_URL is not configured");
  }

  if (
    typeof env.SCHED_BOT_IMAGE_RELAY_KEY !== "string" ||
    env.SCHED_BOT_IMAGE_RELAY_KEY.length === 0
  ) {
    throw new Error("SCHED_BOT_IMAGE_RELAY_KEY is not configured");
  }

  const base = baseRaw;
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

function getRelayKey() {
  const relayKeyRaw = env.SCHED_BOT_IMAGE_RELAY_KEY;
  if (typeof relayKeyRaw !== "string" || relayKeyRaw.length === 0) {
    throw new Error("SCHED_BOT_IMAGE_RELAY_KEY is not configured");
  }

  return relayKeyRaw;
}

function getRelayTimeoutMs() {
  return Number(env.SCHED_BOT_IMAGE_RELAY_TIMEOUT_MS);
}

async function parseRelayResponse(response: Response): Promise<RelayResult> {
  const payload = (await response.json()) as RelaySendResponse;
  if (!response.ok || !payload.ok || !payload.fileId) {
    throw new Error(
      `Relay request failed (${response.status}): ${payload.error ?? "unknown error"}`,
    );
  }

  return { fileId: payload.fileId };
}

async function postRelay(
  path: string,
  init: RequestInit,
): Promise<RelayResult> {
  const response = await fetch(getRelayUrl(path), {
    ...init,
    headers: {
      "x-relay-key": getRelayKey(),
      ...init.headers,
    },
    signal: AbortSignal.timeout(getRelayTimeoutMs()),
  });

  return parseRelayResponse(response);
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

  return postRelay("/send/file", {
    method: "POST",
    body: form,
  });
}

export async function relayImageByBase64(opts: {
  target: string;
  imageBase64: string;
  mimeType: string;
  filename?: string;
}) {
  return postRelay("/send/base64", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      target: opts.target,
      data: opts.imageBase64,
      mimeType: opts.mimeType,
      filename: opts.filename ?? "schedule.jpg",
    }),
  });
}

export async function relayImageByUrl(opts: { target: string; url: string }) {
  return postRelay("/send/url", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      target: opts.target,
      url: opts.url,
    }),
  });
}
