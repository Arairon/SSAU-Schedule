import { initContract } from "@ts-rest/core";

import z from "zod";
import {
  TimetableSchema,
  TimetableDiffSchema,
  TimetableImageSchema,
} from "./schedule.schema";

const c = initContract();

export const scheduleContract = c.router({
  getTimetable: {
    method: "GET",
    path: "/json",
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
    responses: {
      200: TimetableSchema.and(
        z.object({ diff: TimetableDiffSchema.optional() }),
      ),
      404: z.string(),
      500: z.string(),
    },
  },
  getTimetableWithImage: {
    method: "GET",
    path: "/image",
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
    responses: {
      200: z.object({
        timetable: TimetableSchema.and(
          z.object({ diff: TimetableDiffSchema.optional() }),
        ),
        image: TimetableImageSchema, // base64-encoded PNG
      }),
      404: z.string(),
      500: z.string(),
    },
  },
});
