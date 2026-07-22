import { db } from "@/db";
import { findGroup } from "@/ssau/search";
import { schedule } from "@/schedule/requests";
import { detectImageMimeType } from "@ssau-schedule/shared/utils";
import type { WithAuth } from "./auth";
import Elysia from "elysia";
import z from "zod";
import type { TimetableWithDiff } from "@ssau-schedule/shared/timetable";

export const app = new Elysia<"/schedule", WithAuth>({ prefix: "/schedule" })
  .get(
    "/",
    async ({ query, auth, status }) => {
      if (!auth) {
        return status(403, "Unauthorized");
      }

      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;

      let groupId: number | undefined = undefined;
      if (query.groupId || query.group) {
        if (query.groupId) {
          groupId = (await findGroup({
            groupId: query.groupId,
          }))?.id;
        } else if (query.group) {
          groupId = (await findGroup({
            groupName: query.group,
          }))?.id;
        }
      }

      const timetable = await schedule.getTimetable(user, query.week, {
        ignoreCached: true,
        groupId: (groupId ?? 0) || undefined,
      });

      return timetable as TimetableWithDiff;
    },
    {
      query: z.object({
        week: z.coerce.number().optional().default(0),
        group: z.string().optional(),
        groupId: z.coerce.number().optional(),
      })
    },
  )
  .get(
    "/image/:hash/:stylemap",
    async ({ params, status, set }) => {
      const image = await db.weekImage.findUnique({
        where: {
          stylemap_timetableHash: {
            stylemap: params.stylemap,
            timetableHash: params.hash,
          },
          validUntil: { gt: new Date() },
        },
      });

      if (!image) {
        return status(404, "Image not found");
      }

      const imageBuffer = Buffer.from(image.data, "base64");
      set.headers["content-type"] = detectImageMimeType(imageBuffer);
      return imageBuffer;
    },
    { params: z.object({ hash: z.string(), stylemap: z.string() }) },
  );
