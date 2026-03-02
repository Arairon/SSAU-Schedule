import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

export const ScheduleSingleLessonSchema = z.object({
  id: z.number(),
  infoId: z.number(),
  type: z.string(),
  discipline: z.string(),
  teacher: z.object({
    name: z.string(),
    id: z.number().nullable(),
  }),
  isOnline: z.boolean(),
  isIet: z.boolean(),
  building: z.string().nullable(),
  room: z.string().nullable(),
  dayTimeSlot: z.number(),
  beginTime: z.coerce.date(),
  endTime: z.coerce.date(),
  subgroup: z.number().nullable(),
  conferenceUrl: z.string().nullable(),
  customized: z
    .object({
      hidden: z.boolean(),
      disabled: z.boolean(),
      comment: z.string(),
      customizedBy: z.number(),
    })
    .nullable(),
});

export const ScheduleLessonSchema = ScheduleSingleLessonSchema.and(
  z.object({
    alts: z.array(
      ScheduleSingleLessonSchema.and(
        z.object({ original: ScheduleSingleLessonSchema.nullable() }),
      ),
    ),
    original: ScheduleSingleLessonSchema.nullable(),
  }),
);

export const ScheduleDaySchema = z.object({
  week: z.number(),
  weekday: z.number(),
  beginTime: z.coerce.date(),
  endTime: z.coerce.date(),
  lessonCount: z.number(),
  lessons: z.array(ScheduleLessonSchema),
});

export const ScheduleSchema = z.object({
  weekId: z.number(),
  groupId: z.number(),
  year: z.number(),
  week: z.number(),
  days: z.array(ScheduleDaySchema),
});

export const GetScheduleQuerySchema = z.object({
  week: z.coerce.number().min(0).max(52).default(0),
  group: z.string().default(""),
  groupId: z.coerce.number().default(0),
  ignoreCached: z.coerce.boolean().default(false),
});

export const scheduleContract = c.router({
  getSchedule: {
    method: "GET",
    path: "/",
    query: GetScheduleQuerySchema,
    responses: {
      200: ScheduleSchema,
      403: z.string(),
    },
  },
});

export type ScheduleLessonType = z.infer<typeof ScheduleLessonSchema>;
export type ScheduleDayType = z.infer<typeof ScheduleDaySchema>;
export type ScheduleType = z.infer<typeof ScheduleSchema>;
