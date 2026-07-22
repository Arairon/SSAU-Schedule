import Elysia from "elysia";
import z from "zod";

import { db } from "@/db";
import { schedule } from "@/schedule/requests";
import type {
  Timetable,
  TimetableDiff,
  TimetableLesson,
} from "@ssau-schedule/shared/timetable";
import {
  convertLessonToTimetableLesson,
  groupContinousLessons,
  type RequestStateUpdate,
} from "@ssau-schedule/shared/misc";
import { getWeekFromDate } from "@ssau-schedule/shared/date";
import { streamWithUpdates } from "@/lib/apiUpdateStream";
import { generateTimetableImageHtml } from "@/schedule/image";
import { stringBool } from "@/lib/misc";

const scheduleRequestQuerySchema = z.object({
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
});

type scheduleRequestUpdateCallback = (
  update: RequestStateUpdate<"updatingWeek" | "generatingTimetable" | "error">,
) => void;

type scheduleImageRequestUpdateCallback = (
  update: RequestStateUpdate<
    "updatingWeek" | "generatingTimetable" | "generatingImage" | "error"
  >,
) => void;

type ImageGenerator = AsyncGenerator<
  | Parameters<scheduleImageRequestUpdateCallback>[0]
  | {
    timetable: Timetable & { diff?: TimetableDiff };
    image: {
      id: number;
      tgId: string | null;
      data: string;
      timetableHash: string;
      stylemap: string;
    };
  }
>;

async function* streamedScheduleResponse(ctx: {
  query: z.infer<typeof scheduleRequestQuerySchema>;
  status: (code: number, message: string) => { code: number; response: string };
}) {
  const { query, status } = ctx;
  const user = await db.user.findUnique({
    where: { id: query.userId },
  });

  if (!user) return status(404, "User not found");

  yield* streamWithUpdates<
    Parameters<scheduleRequestUpdateCallback>[0],
    Timetable & { diff?: TimetableDiff }
  >(
    (onUpdate) =>
      schedule.getTimetable(user, query.week, {
        ...query,
        onUpdate,
      }),
    (result) => result,
  );
}

export const app = new Elysia()
  .get(
    "/json",
    async ({ query, status }) => {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });
      if (!user) return status(404, "User not found");

      const timetable = await schedule.getTimetable(user, query.week, query);
      return timetable as Timetable & { diff: TimetableDiff | null };
    },
    {
      query: scheduleRequestQuerySchema,
    },
  )
  .get("/json/stream", streamedScheduleResponse, {
    query: scheduleRequestQuerySchema,
  })
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
        query,
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
      query: scheduleRequestQuerySchema.extend({
        stylemap: z.string().optional(),
      }),
    },
  )
  .get(
    "/image/stream",
    async function* ({ query, status, set }) {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });

      if (!user) return status(404, "User not found");

      set.headers["content-type"] = "text/event-stream";

      yield* streamWithUpdates<
        Parameters<scheduleImageRequestUpdateCallback>[0],
        Awaited<ReturnType<typeof schedule.getTimetableWithImage>>,
        {
          timetable: Timetable & { diff?: TimetableDiff };
          image: {
            id: number;
            tgId: string | null;
            data: string;
            timetableHash: string;
            stylemap: string;
          };
        }
      >(
        (onUpdate) =>
          schedule.getTimetableWithImage(user, query.week, {
            ...query,
            onUpdate,
          }),
        (result) => ({
          timetable: result.timetable,
          image: Object.assign(result.image, {
            data: result.image.data.toString("base64"),
          }),
        }),
      ) as ImageGenerator;
    },
    {
      query: scheduleRequestQuerySchema.extend({
        stylemap: z.string().optional(),
      }),
    },
  )
  .get(
    "/image/html",
    async ({ query, status, set }) => {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });
      if (!user) return status(404, "User not found");

      const timetable = await schedule.getTimetable(user, query.week, query);
      const html = await generateTimetableImageHtml(timetable, {
        stylemap: query.stylemap,
        showTeacher: query.showTeacher,
        showGrouplist: query.showGrouplist,
      });

      set.headers["content-type"] = "text/html";
      return html;
    },
    {
      query: scheduleRequestQuerySchema.extend({
        stylemap: z.string().optional(),
        showTeacher: stringBool.default(true),
        showGrouplist: stringBool.default(false),
      }),
    },
  )
  .get(
    "/image/png",
    async ({ query, status, set }) => {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });
      if (!user) return status(404, "User not found");

      const { image } = await schedule.getTimetableWithImage(
        user,
        query.week,
        query,
      );

      set.headers["content-type"] = "image/png";
      return image.data;
    },
    {
      query: scheduleRequestQuerySchema.extend({
        stylemap: z.string().optional(),
      }),
    },
  )
  .get(
    "/exams",
    async ({ query, status }) => {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });

      if (!user) return status(404, "User not found");
      if (!user.groupId) return status(400, "User has no groupId");

      const now = new Date();
      const currentWeek = getWeekFromDate(now);
      const firstSemester = currentWeek < 23;

      const exams: TimetableLesson[] = (
        await db.lesson.findMany({
          where: {
            groups: {
              some: {
                id: user.groupId,
              },
            },
            type: {
              in: query.includeConsultations ? ["Exam", "Consult"] : ["Exam"],
            },
            weekNumber: {
              gte: firstSemester ? 0 : 23,
              lte: firstSemester ? 22 : 52,
            },
          },
          include: {
            teacher: true,
            groups: true,
          },
        })
      )
        .filter(
          (l) =>
            !!query.ignoreSubgroup ||
            !user.subgroup ||
            l.subgroup === null ||
            l.subgroup === user.subgroup,
        )
        .map(convertLessonToTimetableLesson);

      const grouped = groupContinousLessons(exams); // Since many exams span multiple lessons

      return grouped;
    },
    {
      query: z.object({
        userId: z.coerce.number().int(),
        includeConsultations: z.coerce.boolean().default(false).optional(),
        ignoreSubgroup: z.coerce.boolean().default(false).optional(),
      }),
    },
  );
