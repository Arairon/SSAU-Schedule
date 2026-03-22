import Elysia from "elysia";
import z from "zod";

import { db } from "@/db";
import { schedule } from "@/schedule/requests";
import type { Timetable, TimetableDiff } from "@ssau-schedule/shared/timetable";
import type { RequestStateUpdate } from "@ssau-schedule/shared/misc";

const stringBool = z
  .string()
  .toLowerCase()
  .transform((val) => val === "true")
  .optional();

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

async function* streamWithUpdates<TUpdate, TResult, TFinal = TResult>(
  request: (onUpdate: (update: TUpdate) => void) => Promise<TResult>,
  mapResult: (result: TResult) => TFinal,
) {
  const updatesQueue: TUpdate[] = [];
  let notifyUpdate: (() => void) | null = null;

  const pushUpdate = (update: TUpdate) => {
    updatesQueue.push(update);
    if (notifyUpdate) {
      notifyUpdate();
      notifyUpdate = null;
    }
  };

  const waitForUpdate = () =>
    new Promise<void>((resolve) => {
      notifyUpdate = resolve;
    });

  const requestPromise = request(pushUpdate);

  let running = true;
  while (running) {
    if (updatesQueue.length > 0) {
      yield updatesQueue.shift()!;
      continue;
    }

    const nextEvent = await Promise.race([
      requestPromise.then((result) => ({ type: "result" as const, result })),
      waitForUpdate().then(() => ({ type: "update" as const })),
    ]);

    if (nextEvent.type === "result") {
      while (updatesQueue.length > 0) {
        yield updatesQueue.shift()!;
      }
      yield mapResult(nextEvent.result);
      running = false;
    }
  }
}

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
      );
    },
    {
      query: scheduleRequestQuerySchema.extend({
        stylemap: z.string().optional(),
      }),
    },
  );
