import { db } from "@/db";
import { findGroup } from "@/ssau/search";
import { schedule } from "@/schedule/requests";
import { detectImageMimeType } from "@ssau-schedule/shared/utils";
import type { WithAuth } from "./auth";
import Elysia from "elysia";
import z from "zod";
import { GetScheduleQuerySchema } from "@ssau-schedule/contracts/v0/schedule";

export const app = new Elysia<"/schedule", WithAuth>({ prefix: "/schedule" })
  .get(
    "/",
    async ({ query, auth, status }) => {
      if (!auth) {
        return status(403, "Unauthorized");
      }

      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
      const group = await findGroup({
        groupId: query.groupId,
        groupName: query.group,
      });
      const timetable = await schedule.getTimetable(user, query.week, {
        ignoreCached: true,
        groupId: (group?.id ?? 0) || undefined,
      });

      return timetable;
    },
    { query: GetScheduleQuerySchema },
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
