import { InputFile } from "grammy";

import { env } from "@/env";
import log from "@/logger";
import { detectImageMimeType } from "@ssau-schedule/shared/utils";
import { relayImageByFile } from "@/lib/telegramRelay";
import type { Context } from "./types";
import { api } from "@/serverClient";

export type ScheduleUploadMode = "file" | "url" | "relay";

function getUploadModesOrder(): ScheduleUploadMode[] {
  switch (env.SCHED_BOT_IMAGE_UPLOAD_MODE) {
    case "url":
      return ["url", "file"];
    case "relay":
      return ["relay", "file", "url"];
    default:
      return ["file", "url"];
  }
}

function getScheduleImageUrl(timetableHash: string, stylemap: string) {
  return `https://${env.SCHED_BOT_DOMAIN}/api/v0/schedule/image/${encodeURIComponent(timetableHash)}/${encodeURIComponent(stylemap)}`;
}

function getImageDumpChatId() {
  if (!env.SCHED_BOT_IMAGE_DUMP_CHATID) {
    throw new Error("SCHED_BOT_IMAGE_DUMP_CHATID is not configured");
  }

  return env.SCHED_BOT_IMAGE_DUMP_CHATID;
}

function getPhotoFileIdFromMessage(
  msg: Awaited<ReturnType<Context["api"]["sendPhoto"]>>,
) {
  const fileId = msg.photo[msg.photo.length - 1]?.file_id;
  if (!fileId) {
    throw new Error("Telegram response has no photo file_id");
  }

  return fileId;
}

async function uploadViaRelay(opts: {
  image: Buffer;
  caption?: string;
  userId?: number | bigint | string;
}) {
  const target = getImageDumpChatId();
  const mimeType = detectImageMimeType(opts.image);

  // const attempts = [
  //   () =>
  //     relayImageByFile({
  //       target,
  //       image: opts.image,
  //       mimeType,
  //       filename: "schedule.jpg",
  //     }),
  //   () =>
  //     relayImageByBase64({
  //       target,
  //       imageBase64: opts.image.toString("base64"),
  //       mimeType,
  //       filename: "schedule.jpg",
  //     }),
  //   () => relayImageByUrl({ target, url: opts.imageUrl }),
  // ];

  try {
    const sent = await relayImageByFile({
      target,
      image: opts.image,
      mimeType,
      filename: "schedule.jpg",
      caption: opts.caption,
    });
    return sent.fileId;
  } catch (error) {
    log.warn(`Relay upload attempt failed: ${String(error)}`, {
      user: opts.userId,
    });
    throw new Error(`Relay upload failed: ${String(error)}`);
  }
}

async function uploadViaBotApi(opts: {
  api: Context["api"];
  mode: Exclude<ScheduleUploadMode, "relay">;
  image: Buffer;
  imageUrl?: string;
  caption: string;
}) {
  if (opts.mode === "url" && !opts.imageUrl) {
    throw new Error("Image URL is required for URL upload mode");
  }
  const target = getImageDumpChatId();
  const media =
    opts.mode === "url"
      ? new InputFile({ url: opts.imageUrl! })
      : new InputFile(opts.image);

  const sent = await opts.api.sendPhoto(target, media, {
    caption: opts.caption,
  });

  return getPhotoFileIdFromMessage(sent);
}

type UploadImageOpts = {
  api?: Context["api"];
  image: Buffer;
  imageUrl?: string;
  caption: string;
  userId?: number | bigint | string;
  onFallbackAttempt?: () => void;
};

export async function uploadImage(opts: UploadImageOpts) {
  const uploadModes = getUploadModesOrder();

  let lastError: unknown;
  for (const [index, mode] of uploadModes.entries()) {
    try {
      if (mode === "url" && !opts.imageUrl) continue;
      if (mode === "relay") {
        const fileId = await uploadViaRelay({
          image: opts.image,
          userId: opts.userId,
          caption: opts.caption,
        });
        log.debug(`Image uploaded using relay mode. fileId=${fileId}`, {
          user: opts.userId,
        });
        return { fileId, mode };
      } else if (!opts.api) {
        // No api instance provided, can't use bot API upload modes
        continue;
      }

      const fileId = await uploadViaBotApi({
        api: opts.api,
        mode,
        image: opts.image,
        imageUrl: opts.imageUrl,
        caption: opts.caption,
      });
      log.debug(`Image uploaded using ${mode} mode. fileId=${fileId}`, {
        user: opts.userId,
      });
      return { fileId, mode };
    } catch (error) {
      lastError = error;
      log.warn(`Failed to upload image using ${mode}: ${String(error)}`, {
        user: opts.userId,
      });

      if (index < uploadModes.length - 1) {
        opts.onFallbackAttempt?.();
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("No valid mode for uploading found");
}

type UploadScheduleImageToDumpChatOpts = {
  api?: Context["api"];
  image: {
    id: number;
    data: Buffer;
    timetableHash: string;
    stylemap: string;
  };
  caption?: string;
  userId?: number | bigint | string;
  dontSaveToDb?: boolean;
  onFallbackAttempt?: () => void;
};

export async function uploadScheduleImage(
  opts: UploadScheduleImageToDumpChatOpts,
) {
  const image = opts.image;
  const imageUrl = getScheduleImageUrl(image.timetableHash, image.stylemap);
  const caption = opts.caption ?? `${image.timetableHash}/${image.stylemap}`;

  const res = await uploadImage({
    api: opts.api,
    image: image.data,
    imageUrl,
    caption,
    userId: opts.userId,
    onFallbackAttempt: opts.onFallbackAttempt,
  });
  if (opts.dontSaveToDb) return res;

  await api.misc.uploadedImage({ id: image.id }).post(res.fileId);

  return res;
}
