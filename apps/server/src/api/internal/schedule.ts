import Elysia from "elysia";
import z from "zod";

import { db } from "@/db";
import { schedule } from "@/schedule/requests";

export const app = new Elysia()
  .get(
    "/json",
    async ({ query, status }) => {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });

      if (!user) return status(404, "User not found");

      const timetable = await schedule.getTimetable(user, query.week, {
        groupId: query.groupId,
        year: query.year,
        ignoreCached: query.ignoreCached,
        ignoreUpdate: query.ignoreUpdate,
        dontCache: query.dontCache,
        ignoreIet: query.ignoreIet,
        ignoreSubgroup: query.ignoreSubgroup,
      });

      return timetable;
    },
    {
      query: z.object({
        userId: z.coerce.number().int(),
        week: z.coerce.number().int().default(0),

        groupId: z.coerce.number().int().optional(),
        year: z.coerce.number().int().optional(),
        // opts
        ignoreCached: z.boolean().optional(),
        ignoreUpdate: z.boolean().optional(),
        dontCache: z.boolean().optional(),
        ignoreIet: z.boolean().optional(),
        ignoreSubgroup: z.boolean().optional(),
      }),
    },
  )
  .get(
    "/image",
    async ({ query, status }) => {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });

      if (!user) return status(404, "User not found");

      const { timetable, image } = await schedule.getTimetableWithImage(
        user,
        query.week,
        {
          groupId: query.groupId,
          year: query.year,
          stylemap: query.stylemap,
          ignoreCached: query.ignoreCached,
          ignoreUpdate: query.ignoreUpdate,
          dontCache: query.dontCache,
          ignoreIet: query.ignoreIet,
          ignoreSubgroup: query.ignoreSubgroup,
        },
      );

      return {
        timetable,
        image: Object.assign(image, { data: image.data.toString("base64") }),
      };
    },
    {
      query: z.object({
        userId: z.coerce.number().int(),
        week: z.coerce.number().int().default(0),

        groupId: z.coerce.number().int().optional(),
        year: z.coerce.number().int().optional(),
        stylemap: z.string().optional(),
        // opts
        ignoreCached: z.boolean().optional(),
        ignoreUpdate: z.boolean().optional(),
        dontCache: z.boolean().optional(),
        ignoreIet: z.boolean().optional(),
        ignoreSubgroup: z.boolean().optional(),
      }),
    },
  );
