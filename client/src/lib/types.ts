import { z } from 'zod';


export type LessonDateTime = {
  weekNumber: number;
  dayTimeSlot: number;
  weekday: number;
  // timeSlotStart?: number;
  // timeSlotEnd?: number;
}

export const ScheduleSingleLessonSchema = z.object({
  id: z.number(),
  infoId: z.number(),
  type: z.string(),
  discipline: z.string(),
  teacher: z.object({
    name: z.string(),
    id: z.number().nullable()
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
  customized: z.object({
    hidden: z.boolean(),
    disabled: z.boolean(),
    comment: z.string(),
    customizedBy: z.number(),
  }).nullable(),
})
export const ScheduleLessonSchema = ScheduleSingleLessonSchema.and(z.object({ alts: z.array(ScheduleSingleLessonSchema.and(z.object({ original: ScheduleSingleLessonSchema.nullable() }))), original: ScheduleSingleLessonSchema.nullable() }))
export type ScheduleLessonType = z.infer<typeof ScheduleLessonSchema>;

export const ScheduleDaySchema = z.object({
  week: z.number(),
  weekday: z.number(),
  beginTime: z.coerce.date(),
  endTime: z.coerce.date(),
  lessonCount: z.number(),
  lessons: z.array(ScheduleLessonSchema)
})
export type ScheduleDayType = z.infer<typeof ScheduleDaySchema>;

export const ScheduleSchema = z.object({
  weekId: z.number(),
  groupId: z.number(),
  year: z.number(),
  week: z.number(),
  days: z.array(ScheduleDaySchema)

})
export type ScheduleType = z.infer<typeof ScheduleSchema>;

export const TimeSlotMap = [
  {
    name: "00:00-00:00",
    beginTime: "00:00",
    endTime: "00:00",
    beginDelta: 0,
    endDelta: 0,
  },
  {
    name: "08:00-09:35",
    beginTime: "08:00",
    endTime: "09:35",
    beginDelta: 28800_000,
    endDelta: 34500_000,
  },
  {
    name: "09:45-11:20",
    beginTime: "09:45",
    endTime: "11:20",
    beginDelta: 35100_000,
    endDelta: 40800_000,
  },
  {
    name: "11:30-13:05",
    beginTime: "11:30",
    endTime: "13:05",
    beginDelta: 41400_000,
    endDelta: 47100_000,
  },
  {
    name: "13:30-15:05",
    beginTime: "13:30",
    endTime: "15:05",
    beginDelta: 48600_000,
    endDelta: 54300_000,
  },
  {
    name: "15:15-16:50",
    beginTime: "15:15",
    endTime: "16:50",
    beginDelta: 54900_000,
    endDelta: 60600_000,
  },
  {
    name: "17:00-18:35",
    beginTime: "17:00",
    endTime: "18:35",
    beginDelta: 61200_000,
    endDelta: 66900_000,
  },
  {
    name: "18:45-20:15",
    beginTime: "18:45",
    endTime: "20:15",
    beginDelta: 67500_000,
    endDelta: 72900_000,
  },
  {
    name: "20:25-21:55",
    beginTime: "20:25",
    endTime: "21:55",
    beginDelta: 73500_000,
    endDelta: 78900_000,
  },
];

export type CustomizationData = {
  id: number;
  type: string;
  lessonId: number;
  lessonInfoId: number;
  isEnabled: boolean;
  hideLesson: boolean;
  discipline: string;
  building: string | null;
  room: string | null;
  conferenceUrl: string | null;
  subgroup: number | null;
  teacherId: number | null;
  isIet: boolean;
  isOnline: boolean;
  dayTimeSlot: number;
  weekNumber: number;
  weekday: number;
  comment: string;
  userId: number;
}
