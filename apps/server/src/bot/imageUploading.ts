import { InputFile } from "grammy";

import { env } from "@/env";
import log from "@/logger";
import { detectImageMimeType } from "@/schedule/image";
import { relayImageByFile } from "@/lib/telegramRelay";
import type { Context } from "./types";

export type ScheduleUploadMode = "file" | "url" | "relay";

type UploadScheduleImageToDumpChatOpts = {
  api: Context["api"];
  image: Buffer;
  timetableHash: string;
  stylemap: string;
  userId?: number | bigint | string;
  onFallbackAttempt?: () => void;
};

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
  imageUrl: string;
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
  imageUrl: string;
  timetableHash: string;
  stylemap: string;
}) {
  const target = getImageDumpChatId();
  const media =
    opts.mode === "url"
      ? new InputFile({ url: opts.imageUrl })
      : new InputFile(opts.image);

  const sent = await opts.api.sendPhoto(target, media, {
    caption: `schedule_image\n${opts.timetableHash}/${opts.stylemap}`,
  });

  return getPhotoFileIdFromMessage(sent);
}

export async function uploadScheduleImage(
  opts: UploadScheduleImageToDumpChatOpts,
) {
  const imageUrl = getScheduleImageUrl(opts.timetableHash, opts.stylemap);
  const uploadModes = getUploadModesOrder();

  let lastError: unknown;
  for (const [index, mode] of uploadModes.entries()) {
    try {
      if (mode === "relay") {
        const fileId = await uploadViaRelay({
          image: opts.image,
          imageUrl,
          userId: opts.userId,
        });
        log.debug(`Image uploaded using relay mode. fileId=${fileId}`, {
          user: opts.userId,
        });
        return { fileId, mode };
      }

      const fileId = await uploadViaBotApi({
        api: opts.api,
        mode,
        image: opts.image,
        imageUrl,
        timetableHash: opts.timetableHash,
        stylemap: opts.stylemap,
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
    : new Error("Failed to upload image to dump chat in any mode");
}
