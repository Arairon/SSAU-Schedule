import { db } from "@/db";
import { schedule } from "@/schedule/requests";
import { getWeekFromDate } from "@ssau-schedule/shared/date";
import type { TeacherTimetable } from "@ssau-schedule/shared/timetable";
import Elysia from "elysia";
import z from "zod";

export const app = new Elysia()
  .get(
    "/schedule/json",
    async ({ query, status }) => {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });
      if (!user) return status(404, "User not found");

      const week = query.week ?? getWeekFromDate(new Date());
      const timetable = await schedule.getTeacherTimetable(
        user,
        week,
        query.teacherId,
      );

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      return timetable as TeacherTimetable;
    },
    {
      query: z.object({
        userId: z.coerce.number(),
        teacherId: z.coerce.number(),
        week: z.coerce.number().optional(),
      }),
    },
  )
  .get(
    "/schedule/image",
    async ({ query, status }) => {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });
      if (!user) return status(404, "User not found");

      const week = query.week ?? getWeekFromDate(new Date());
      const { timetable, image } = await schedule.getTeacherTimetableWithImage(
        user,
        week,
        query.teacherId,
      );

      return { timetable, image };
    },
    {
      query: z.object({
        userId: z.coerce.number(),
        teacherId: z.coerce.number(),
        week: z.coerce.number().optional(),
      }),
    },
  )
  .get(
    "/schedule/image/png",
    async ({ query, status, set }) => {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });
      if (!user) return status(404, "User not found");

      const week = query.week ?? getWeekFromDate(new Date());
      const { image } = await schedule.getTeacherTimetableWithImage(
        user,
        week,
        query.teacherId,
      );

      set.headers["content-type"] = "image/png";
      return image;
    },
    {
      query: z.object({
        userId: z.coerce.number(),
        teacherId: z.coerce.number(),
        week: z.coerce.number().optional(),
      }),
    },
  );
