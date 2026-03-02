import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

export const CustomizationDataSchema = z.object({
  id: z.number(),
  lessonId: z.number(),
  lessonInfoId: z.number(),
  isEnabled: z.boolean(),
  hideLesson: z.boolean(),
  type: z.string(),
  discipline: z.string(),
  building: z.string().nullable(),
  room: z.string().nullable(),
  conferenceUrl: z.string().nullable(),
  subgroup: z.number().nullable(),
  teacherId: z.number().nullable(),
  isIet: z.boolean(),
  isOnline: z.boolean(),
  dayTimeSlot: z.number().min(1).max(8),
  weekNumber: z.number(),
  weekday: z.number(),
  comment: z.string(),
  userId: z.number(),
  targetUserIds: z.array(z.number()),
  targetGroupIds: z.array(z.number()),
  targetFlowIds: z.array(z.number()),
});

export const CustomizationDataPartialSchema =
  CustomizationDataSchema.partial().required({
    weekNumber: true,
    weekday: true,
    dayTimeSlot: true,
  });

export const customLessonContract = c.router({
  add: {
    method: "POST",
    path: "/",
    body: CustomizationDataPartialSchema.omit({ id: true }),
    responses: {
      200: z.unknown(),
      400: z.string(),
      403: z.string(),
    },
  },
  edit: {
    method: "PUT",
    path: "/",
    body: CustomizationDataPartialSchema.required({ id: true }),
    responses: {
      200: z.unknown(),
      400: z.string(),
      403: z.string(),
      404: z.string(),
    },
  },
  remove: {
    method: "DELETE",
    path: "/:lessonId",
    pathParams: z.object({
      lessonId: z.coerce.number(),
    }),
    responses: {
      200: z.unknown(),
      403: z.string(),
      404: z.string(),
    },
  },
});
