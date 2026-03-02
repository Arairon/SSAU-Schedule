import {
  ScheduleDaySchema,
  ScheduleLessonSchema,
  ScheduleSchema,
} from '@ssau-schedule/contracts/v0/schedule'
import type {
  ScheduleDayType,
  ScheduleLessonType,
  ScheduleType,
} from '@ssau-schedule/contracts/v0/schedule'

export type LessonDateTime = {
  weekNumber: number
  dayTimeSlot: number
  weekday: number
  // timeSlotStart?: number;
  // timeSlotEnd?: number;
}

export { ScheduleSchema, ScheduleLessonSchema, ScheduleDaySchema }
export type { ScheduleType, ScheduleDayType, ScheduleLessonType }

export type CustomizationData = {
  id: number
  type: string
  lessonId: number
  lessonInfoId: number
  isEnabled: boolean
  hideLesson: boolean
  discipline: string
  building: string | null
  room: string | null
  conferenceUrl: string | null
  subgroup: number | null
  teacherId: number | null
  isIet: boolean
  isOnline: boolean
  dayTimeSlot: number
  weekNumber: number
  weekday: number
  comment: string
  userId: number
  targetUserIds?: Array<number>
  targetGroupIds?: Array<number>
  targetFlowIds?: Array<number>
}
