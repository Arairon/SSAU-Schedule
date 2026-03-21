import { bot } from "@/bot";
import { uploadScheduleImage } from "@/bot/imageUploading";
import log from "@/logger";
import Elysia from "elysia";
import { type GrammyError, InputFile } from "grammy";
import type { MessageEntity } from "grammy/types";
import z from "zod";

export type DbScheduledMessage = {
  id: number;
  chatId: string;
  text: string;
  entities?: object[];
  sendAt: Date;
  source?: string;
  image?: string; // base64
};

export const app = new Elysia()
  .post(
    "/msgs",
    async ({ body }) => {
      const stats = {
        sentIds: [] as number[],
        failedIds: [] as number[],
        rejectedIds: [] as number[],
      };
      log.debug(`Received request to send ${body.length} scheduled messages`, {
        user: "msgs",
        tag: "Ely",
      });
      for (const msg of body as DbScheduledMessage[]) {
        try {
          if (msg.text.length > 4096) {
            log.warn(
              `Message #${msg.id} text length (${msg.text.length}) exceeds Telegram limit. Truncating.`,
              {
                user: "msgs",
                tag: "Ely",
              },
            );
            msg.text = msg.text.slice(0, 4090) + "...";
          }
          if (msg.image) {
            await bot.api
              .sendPhoto(msg.chatId, new InputFile(msg.image), {
                caption: msg.text,
                caption_entities: (msg.entities ?? []) as MessageEntity[],
              })
              .then(() => stats.sentIds.push(msg.id))
              .catch((e: GrammyError) => {
                if (e.error_code === 403) {
                  log.warn(
                    `User ${msg.chatId} has blocked the bot. Skipping message #${msg.id}.`,
                    {
                      user: "msgs",
                      tag: "Ely",
                    },
                  );
                  stats.rejectedIds.push(msg.id);
                }
              });
          } else {
            await bot.api
              .sendMessage(msg.chatId, msg.text, {
                entities: (msg.entities ?? []) as MessageEntity[],
                link_preview_options: { is_disabled: true },
              })
              .then(() => stats.sentIds.push(msg.id))
              .catch((e: GrammyError) => {
                if (e.error_code === 403) {
                  log.warn(
                    `User ${msg.chatId} has blocked the bot. Skipping message #${msg.id}.`,
                    {
                      user: "msgs",
                      tag: "Ely",
                    },
                  );
                  stats.rejectedIds.push(msg.id);
                }
              });
          }
        } catch (e) {
          stats.failedIds.push(msg.id);
          log.error(
            `Failed to send message #${msg.id} to ${msg.chatId}. Err: ${e as Error}`,
            {
              user: "msgs",
              tag: "Ely",
            },
          );
        }
      }
      return stats;
    },
    {
      body: z.array(
        z.object({
          id: z.number(),
          chatId: z.string(),
          text: z.string(),
          entities: z.array(z.any()).default([]),
          sendAt: z.coerce.date(),
          source: z.string().default(""),
          image: z.string().nullable(), // base64
        }),
      ),
    },
  )
  // .post(
  //   "/image",
  //   async ({ body: image }) => {
  //     let result:
  //       | { id: number; success: true; tgId: string }
  //       | { id: number; success: false; error: string };
  //     await uploadScheduleImage({
  //       image: { ...image, data: Buffer.from(image.data, "base64") },
  //       caption: image.caption || `${image.timetableHash}/${image.stylemap}`,
  //     })
  //       .then(
  //         (res) => (result = { id: image.id, success: true, tgId: res.fileId }),
  //       )
  //       .catch((e) => {
  //         log.error(
  //           `Failed to upload image #${image.id} to Telegram. Err: ${e as Error}`,
  //           {
  //             user: "images",
  //             tag: "Ely",
  //           },
  //         );
  //         result = { id: image.id, success: false, error: String(e) };
  //       });
  //     return result!;
  //   },
  //   {
  //     body: z.object({
  //       id: z.number(),
  //       data: z.string(), // base64
  //       tgId: z.string().nullable(),
  //       caption: z.string().default(""),
  //       timetableHash: z.string(),
  //       stylemap: z.string(),
  //       validUntil: z.coerce.date(),
  //     }),
  //   },
  // )
  .post(
    "/images",
    async ({ body }) => {
      const stats = [] as (
        | { id: number; success: true; tgId: string }
        | { id: number; success: false; error: string }
      )[];
      for (const image of body) {
        await uploadScheduleImage({
          image: { ...image, data: Buffer.from(image.data, "base64") },
          caption: image.caption || `${image.timetableHash}/${image.stylemap}`,
        })
          .then((res) =>
            stats.push({ id: image.id, success: true, tgId: res.fileId }),
          )
          .catch((e) => {
            log.error(
              `Failed to upload image #${image.id} to Telegram. Err: ${e as Error}`,
              {
                user: "images",
                tag: "Ely",
              },
            );
            stats.push({ id: image.id, success: false, error: String(e) });
          });
      }
      return stats;
    },
    {
      body: z.array(
        z.object({
          id: z.number(),
          data: z.string(), // base64
          tgId: z.string().nullable(),
          caption: z.string().default(""),
          timetableHash: z.string(),
          stylemap: z.string(),
          validUntil: z.coerce.date(),
        }),
      ),
    },
  );
