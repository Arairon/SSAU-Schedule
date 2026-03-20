import { z } from "zod";

type LessonType =
  | "Lection"
  | "Lab"
  | "Practice"
  | "Other"
  | "Exam"
  | "Consult"
  | "Military"
  | "Window"
  | "CourseWork"
  | "Unknown";

export const LessonTypeSchema = z.enum([
  "Lection",
  "Lab",
  "Practice",
  "Other",
  "Exam",
  "Consult",
  "Military",
  "Window",
  "CourseWork",
  "Unknown",
]);

export type TimetableLesson = {
  id: number;
  infoId: number;
  type: LessonType;
  discipline: string;
  teacher: {
    name: string;
    id: number | null;
  };
  isOnline: boolean;
  building: string | null;
  room: string | null;
  isIet: boolean;
  subgroup: number | null;
  groups: string[];
  flows: string[];
  dayTimeSlot: number;
  beginTime: Date;
  endTime: Date;
  conferenceUrl: string | null;
  original: TimetableLesson | null;
  customized: {
    hidden: boolean;
    disabled: boolean;
    comment: string;
    customizedBy: number;
  } | null;
  alts: TimetableLesson[];
};

export const TimetableLessonTeacherSchema = z.object({
  name: z.string(),
  id: z.number().nullable(),
});

export const TimetableLessonCustomizedSchema = z.object({
  hidden: z.boolean(),
  disabled: z.boolean(),
  comment: z.string(),
  customizedBy: z.number(),
});

const TimetableLessonCoreSchema = z.object({
  id: z.number(),
  infoId: z.number(),
  type: LessonTypeSchema,
  discipline: z.string(),
  teacher: TimetableLessonTeacherSchema,
  isOnline: z.boolean(),
  building: z.string().nullable(),
  room: z.string().nullable(),
  isIet: z.boolean(),
  subgroup: z.number().nullable(),
  groups: z.array(z.string()),
  flows: z.array(z.string()),
  dayTimeSlot: z.number(),
  beginTime: z.date(),
  endTime: z.date(),
  conferenceUrl: z.string().nullable(),
  customized: TimetableLessonCustomizedSchema.nullable(),
});

export const TimetableLessonSchema: z.ZodType<TimetableLesson> = z.lazy(() =>
  TimetableLessonCoreSchema.extend({
    original: TimetableLessonSchema.nullable(),
    alts: z.array(TimetableLessonSchema),
  }),
);

const TimetableLessonPartialSchema: z.ZodType<Partial<TimetableLesson>> =
  TimetableLessonCoreSchema.partial().extend({
    original: TimetableLessonSchema.nullable().optional(),
    alts: z.array(TimetableLessonSchema).optional(),
  });

export type TimetableDay = {
  // user: number;
  week: number;
  weekday: number;
  beginTime: Date;
  endTime: Date;
  lessons: TimetableLesson[]; // Has variable length
  lessonCount: number;
};

export const TimetableDaySchema = z.object({
  week: z.number(),
  weekday: z.number(),
  beginTime: z.date(),
  endTime: z.date(),
  lessons: z.array(TimetableLessonSchema),
  lessonCount: z.number(),
});

export type Timetable = {
  weekId: number;
  // user: number; // To allow sharing hashes
  groupId: number;
  year: number;
  week: number;
  hash: string;
  //withIet: boolean;
  //isCommon: boolean;
  days: TimetableDay[]; // Should always have length of 6
};

export const TimetableSchema = z.object({
  weekId: z.number(),
  groupId: z.number(),
  year: z.number(),
  week: z.number(),
  hash: z.string(),
  days: z.array(TimetableDaySchema),
});

export type TimetableDayWithWindows = {
  // user: number;
  week: number;
  weekday: number;
  beginTime: Date;
  endTime: Date;
  lessons: (TimetableLesson | null)[]; // Should always have length of 8, some slots can be null if there are no lessons
  lessonCount: number;
};

export const TimetableDayWithWindowsSchema = z.object({
  week: z.number(),
  weekday: z.number(),
  beginTime: z.date(),
  endTime: z.date(),
  lessons: z.array(TimetableLessonSchema.nullable()),
  lessonCount: z.number(),
});

export type TimetableWithWindows = {
  weekId: number;
  // user: number; // To allow sharing hashes
  groupId: number;
  year: number;
  week: number;
  hash: string;
  //withIet: boolean;
  //isCommon: boolean;
  days: TimetableDayWithWindows[]; // Should always have length of 6
};

export const TimetableWithWindowsSchema = z.object({
  weekId: z.number(),
  groupId: z.number(),
  year: z.number(),
  week: z.number(),
  hash: z.string(),
  days: z.array(TimetableDayWithWindowsSchema),
});

export type TimetableDiff = {
  added: TimetableLesson[];
  removed: TimetableLesson[];
  modified: { old: Partial<TimetableLesson>; new: TimetableLesson }[]; // Same name, type and time
};

export const TimetableDiffSchema = z.object({
  added: z.array(TimetableLessonSchema),
  removed: z.array(TimetableLessonSchema),
  modified: z.array(
    z.object({
      old: TimetableLessonPartialSchema,
      new: TimetableLessonSchema,
    }),
  ),
});

export const TimetableImageSchema = z.object({
  id: z.number(),
  tgId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  data: z.string(), // base64-encoded PNG
  timetableHash: z.string(),
  validUntil: z.date(),
  stylemap: z.string(),
});
