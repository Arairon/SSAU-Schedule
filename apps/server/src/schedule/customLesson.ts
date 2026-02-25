import type {
  Flow,
  Group,
  Teacher,
  CustomLesson,
  LessonType,
  User,
} from "@/generated/prisma/client";
import s from "ajv-ts";
import log from "@/logger";
import { db } from "@/db";
import { getLessonDate } from "@ssau-schedule/shared/date";
import { TimeSlotMap } from "@ssau-schedule/shared/timeSlotMap";
import type { TimetableLesson } from "./types/timetable";

export const CustomizationDataSchema = s.object({
  id: s.number(),
  lessonId: s.number(),
  lessonInfoId: s.number(),
  isEnabled: s.boolean(),
  hideLesson: s.boolean(),
  type: s.string(),
  discipline: s.string(),
  building: s.string().nullable(),
  room: s.string().nullable(),
  conferenceUrl: s.string().nullable(),
  subgroup: s.number().nullable(),
  teacherId: s.number().nullable(),
  isIet: s.boolean(),
  isOnline: s.boolean(),
  dayTimeSlot: s.number().min(1).max(8),
  // date: s.string().dateTime(),
  // beginTime: s.string().dateTime(),
  // endTime: s.string().dateTime(),
  weekNumber: s.number(),
  weekday: s.number(),
  comment: s.string(),
  userId: s.number(), //
});
export type CustomizationData = s.infer<typeof CustomizationDataSchema>;

export const CustomizationDataSchemaPartial =
  CustomizationDataSchema.partial().requiredFor(
    "weekNumber",
    "weekday",
    "dayTimeSlot",
  );
export type CustomizationDataPartial = s.infer<
  typeof CustomizationDataSchemaPartial
>;

function normalizeCustomLessonData(data: CustomizationDataPartial) {
  const lessonDate = getLessonDate(data.weekNumber, data.weekday);
  return Object.assign({}, data, {
    date: lessonDate,
    beginTime: new Date(
      lessonDate.getTime() + TimeSlotMap[data.dayTimeSlot].beginDelta,
    ),
    endTime: new Date(
      lessonDate.getTime() + TimeSlotMap[data.dayTimeSlot].endDelta,
    ),
  });
}

export async function addCustomLesson(
  user: User,
  customData: CustomizationDataPartial & { id?: null | undefined },
) {
  log.debug(
    `Adding custom lesson (${customData.lessonInfoId ?? "0"}/${customData.lessonId}) with ${JSON.stringify(customData)}`,
    { user: user.id },
  );

  const data = normalizeCustomLessonData(customData);
  data.userId = user.id;

  if (data.lessonInfoId) {
    const lessonsToOverride = await db.lesson.findMany({
      where: { infoId: data.lessonInfoId },
    });
    const lessons = lessonsToOverride.map((lesson) => {
      const custom = normalizeCustomLessonData(
        Object.assign({}, customData, {
          type: data.type ? (data.type as LessonType) : undefined,
          lessonId: lesson.id,
          weekNumber: lesson.weekNumber,
          weekday: lesson.weekday,
          userId: user.id,
        }),
      );
      return custom as CustomLesson;
    });
    return await db.customLesson.createMany({ data: lessons });
  }

  if (data.lessonId) {
    if (!(await db.lesson.findUnique({ where: { id: data.lessonId } })))
      data.lessonId = undefined;
  }

  return await db.customLesson.create({
    data: Object.assign({}, data, {
      id: undefined,
      type: customData.type ? (customData.type as LessonType) : undefined,
      userId: user.id,
    }),
  });
}

export async function deleteCustomLesson(user: User, lessonId: number) {
  log.debug(`Deleting CustomLesson#${lessonId}`, { user: user.id });

  const target = await db.customLesson.findUnique({
    where: { id: lessonId, userId: user.id },
  });
  if (!target) return null;

  if (target.lessonInfoId) {
    return await db.customLesson.deleteMany({
      where: { lessonInfoId: target.lessonInfoId },
    });
  }
  return await db.customLesson.delete({ where: { id: target.id } });
}

export async function editCustomLesson(
  user: User,
  customData: CustomizationDataPartial & { id: number },
) {
  log.debug(
    `Editing ${customData.lessonInfoId ?? "0"}/${customData.lessonId} with ${JSON.stringify(customData)}`,
    { user: user.id },
  );

  log.debug(
    `Adding custom lesson (${customData.lessonInfoId ?? "0"}/${customData.lessonId}) with ${JSON.stringify(customData)}`,
    { user: user.id },
  );

  const data = normalizeCustomLessonData(customData);
  data.id = customData.id;
  data.userId = user.id;

  const target = await db.customLesson.findUnique({
    where: { id: data.id, userId: user.id },
  });
  if (!target) return null;

  if (target.lessonInfoId) {
    const lessonsToOverride = await db.customLesson.findMany({
      where: { lessonInfoId: target.lessonInfoId },
    });
    const lessons = [] as unknown[];
    for (const lesson of lessonsToOverride) {
      const custom = normalizeCustomLessonData(
        Object.assign({}, customData, {
          id: lesson.id,
          lessonId: lesson.lessonId,
          lessonInfoId: target.lessonInfoId,
          type: data.type ? (data.type as LessonType) : undefined,
          weekNumber: lesson.weekNumber,
          weekday: lesson.weekday,
          userId: user.id,
        }),
      ) as CustomLesson;
      lessons.push(
        await db.customLesson.update({
          where: { id: lesson.id },
          data: custom,
        }),
      );
    }
    return lessons;
  }

  if (data.lessonId) {
    if (!(await db.lesson.findUnique({ where: { id: data.lessonId } })))
      data.lessonId = undefined;
  }

  return await db.customLesson.update({
    where: { id: data.id },
    data: Object.assign({}, data, {
      id: undefined,
      type: customData.type ? (customData.type as LessonType) : undefined,
      userId: user.id,
    }),
  });
}

export function applyCustomization(
  lesson: TimetableLesson,
  customLesson: CustomLesson & {
    groups: Group[];
    flows: Flow[];
    teacher: Teacher | null;
    user: User;
  },
) {
  // DateTime customization is applied beforehand.
  lesson.original = Object.assign({}, lesson);
  lesson.customized = {
    hidden: customLesson.hideLesson,
    disabled: !customLesson.isEnabled,
    customizedBy: customLesson.userId,
    comment: customLesson.comment,
  };

  const propsToCopy: (keyof TimetableLesson & keyof CustomLesson)[] = [
    "discipline",
    "type",
    "isOnline",
    "isIet",
    "building",
    "room",
    "conferenceUrl",
    "subgroup",
    "dayTimeSlot",
    "beginTime",
    "endTime",
  ];
  const changes: Partial<CustomLesson> = Object.fromEntries(
    Object.entries(customLesson).filter(
      ([k, v]) => v && (propsToCopy as string[]).includes(k),
    ),
  );
  Object.assign(lesson, changes);
  if (customLesson.teacher)
    lesson.teacher = {
      name: customLesson.teacher.name,
      id: customLesson.teacherId,
    };
  if (customLesson.groups)
    lesson.groups = customLesson.groups.map((g) => g.name);
  if (customLesson.flows) lesson.flows = customLesson.flows.map((f) => f.name);
  lesson.id = customLesson.id;
}
