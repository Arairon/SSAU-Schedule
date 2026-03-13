import { z } from "zod";

const TelegramPhotoSchema = z.object({
  file_id: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  file_size: z.number().int().positive().optional(),
});

const TelegramResultSchema = z.object({
  message_id: z.number().int(),
  photo: z.array(TelegramPhotoSchema).min(1),
});

const TelegramOkSchema = z.object({
  ok: z.literal(true),
  result: TelegramResultSchema,
});

const TelegramErrorSchema = z.object({
  ok: z.literal(false),
  error_code: z.number().int().optional(),
  description: z.string().optional(),
});

type SendPhotoResult = {
  messageId: number;
  fileId: string;
};

function getLargestPhotoFileId(photos: z.infer<typeof TelegramPhotoSchema>[]) {
  const sorted = [...photos].sort((a, b) => {
    const aArea = (a.width ?? 0) * (a.height ?? 0);
    const bArea = (b.width ?? 0) * (b.height ?? 0);
    if (aArea !== bArea) return bArea - aArea;
    return (b.file_size ?? 0) - (a.file_size ?? 0);
  });

  return sorted[0]?.file_id;
}

function getTelegramApiUrl(token: string, method: string) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function parseTelegramSendPhotoResponse(response: Response) {
  const payload: unknown = await response.json();

  const okResult = TelegramOkSchema.safeParse(payload);
  if (okResult.success) {
    const fileId = getLargestPhotoFileId(okResult.data.result.photo);
    if (!fileId) {
      throw new Error("Telegram response does not include a valid file_id");
    }

    return {
      messageId: okResult.data.result.message_id,
      fileId,
    } satisfies SendPhotoResult;
  }

  const errResult = TelegramErrorSchema.safeParse(payload);
  if (errResult.success) {
    throw new Error(
      `Telegram API error (${errResult.data.error_code ?? "unknown"}): ${errResult.data.description ?? "no description"}`,
    );
  }

  throw new Error("Unexpected Telegram API response payload");
}

export async function sendPhotoFromBuffer(opts: {
  token: string;
  target: string;
  image: Buffer;
  mimeType: string;
  filename: string;
  timeoutMs: number;
}) {
  const body = new FormData();
  body.append("chat_id", opts.target);
  body.append(
    "photo",
    new Blob([new Uint8Array(opts.image)], { type: opts.mimeType }),
    opts.filename,
  );

  const response = await fetch(getTelegramApiUrl(opts.token, "sendPhoto"), {
    method: "POST",
    body,
    signal: AbortSignal.timeout(opts.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Telegram sendPhoto failed with HTTP ${response.status}`);
  }

  return parseTelegramSendPhotoResponse(response);
}

export async function sendPhotoFromUrl(opts: {
  token: string;
  target: string;
  imageUrl: string;
  timeoutMs: number;
}) {
  const body = new URLSearchParams();
  body.set("chat_id", opts.target);
  body.set("photo", opts.imageUrl);

  const response = await fetch(getTelegramApiUrl(opts.token, "sendPhoto"), {
    method: "POST",
    body,
    signal: AbortSignal.timeout(opts.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Telegram sendPhoto failed with HTTP ${response.status}`);
  }

  return parseTelegramSendPhotoResponse(response);
}
