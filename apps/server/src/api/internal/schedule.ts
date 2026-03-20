import Elysia from "elysia";
import z from "zod";

import { db } from "@/db";
import { schedule } from "@/schedule/requests";
import type { Timetable, TimetableDiff } from "@ssau-schedule/shared/timetable";

const stringBool = z
  .string()
  .toLowerCase()
  .transform((val) => val === "true")
  .optional();

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
        forceUpdate: query.forceUpdate,
      });

      return timetable as Timetable & { diff: TimetableDiff | null };
    },
    {
      query: z.object({
        userId: z.coerce.number().int(),
        week: z.coerce.number().int().default(0),

        groupId: z.coerce.number().int().optional(),
        year: z.coerce.number().int().optional(),
        // opts
        ignoreCached: stringBool,
        ignoreUpdate: stringBool,
        dontCache: stringBool,
        ignoreIet: stringBool,
        ignoreSubgroup: stringBool,
        forceUpdate: stringBool,
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
          forceUpdate: query.forceUpdate,
        },
      );

      return {
        timetable,
        image: Object.assign(image, { data: image.data.toString("base64") }),
      } as {
        timetable: Timetable & { diff: TimetableDiff | null };
        image: {
          id: number;
          tgId: string | null;
          data: string; // base64
          timetableHash: string;
          stylemap: string;
        };
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
        ignoreCached: stringBool,
        ignoreUpdate: stringBool,
        dontCache: stringBool,
        ignoreIet: stringBool,
        ignoreSubgroup: stringBool,
        forceUpdate: stringBool,
      }),
    },
  );
