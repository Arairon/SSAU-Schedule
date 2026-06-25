import { db } from "@/db";
import { streamWithUpdates } from "@/lib/apiUpdateStream";
import { schedule } from "@/schedule/requests";
import { getWeekFromDate } from "@ssau-schedule/shared/date";
import type { RequestStateUpdate } from "@ssau-schedule/shared/misc";
import type {
  TeacherTimetable,
  TimetableDiff,
} from "@ssau-schedule/shared/timetable";
import Elysia from "elysia";
import z from "zod";

// const stringBool = z
//   .string()
//   .toLowerCase()
//   .transform((val) => val === "true")
//   .optional();

const scheduleRequestQuerySchema = z.object({
  userId: z.coerce.number().int(),
  week: z.coerce.number().int().default(0),
  teacherId: z.coerce.number().int(),

  // groupId: z.coerce.number().int().optional(),
  // year: z.coerce.number().int().optional(),
  // // opts
  // ignoreCached: stringBool,
  // ignoreUpdate: stringBool,
  // dontCache: stringBool,
  // ignoreIet: stringBool,
  // ignoreSubgroup: stringBool,
  // forceUpdate: stringBool,
});

type teacherScheduleImageRequestUpdateCallback = (
  update: RequestStateUpdate<
    | "updatingTeacher"
    | "updatingWeek"
    | "generatingTimetable"
    | "generatingImage"
    | "error"
  >,
) => void;

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
      query: scheduleRequestQuerySchema,
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

      return { timetable, image } as {
        timetable: TeacherTimetable;
        image: Buffer;
      };
    },
    {
      query: scheduleRequestQuerySchema,
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
      query: scheduleRequestQuerySchema,
    },
  )
  .get(
    "/schedule/image/stream",
    async function* ({ query, status, set }) {
      const user = await db.user.findUnique({
        where: { id: query.userId },
      });

      if (!user) return status(404, "User not found");

      set.headers["content-type"] = "text/event-stream";

      yield* streamWithUpdates<
        Parameters<teacherScheduleImageRequestUpdateCallback>[0],
        Awaited<ReturnType<typeof schedule.getTeacherTimetableWithImage>>,
        {
          timetable: TeacherTimetable & { diff?: TimetableDiff };
          image: Buffer;
          // image: {
          //   id: number;
          //   tgId: string | null;
          //   data: string;
          //   timetableHash: string;
          //   stylemap: string;
          // };
        }
      >(
        (onUpdate) =>
          schedule.getTeacherTimetableWithImage(
            user,
            query.week,
            query.teacherId,
            {
              ...query,
              onUpdate,
            },
          ),
        (result) => ({
          timetable: result.timetable,
          image: result.image,
          // image: Object.assign(result.image, {
          //   data: result.image.data.toString("base64"),
          // }),
        }),
      );
    },
    {
      query: scheduleRequestQuerySchema.extend({
        stylemap: z.string().optional(),
      }),
    },
  );
