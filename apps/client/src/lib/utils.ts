import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getWeekFromDate } from '@ssau-schedule/shared/date'
import type { ClassValue } from 'clsx';
import type { CustomizationData, ScheduleLessonType } from './types'

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}

export function getLessonCustomization(lesson: Omit<ScheduleLessonType, "alts">): Partial<CustomizationData> {

  const original = lesson.original ?? {} as any;


  const data: Partial<CustomizationData> = {
    weekNumber: getWeekFromDate(lesson.beginTime),
    weekday: lesson.beginTime.getDay(),
    dayTimeSlot: lesson.dayTimeSlot,
    hideLesson: !!lesson.customized?.hidden,
    comment: lesson.customized?.comment ?? undefined,
    lessonId: lesson.original?.id ?? undefined,
  };

  if (!lesson.customized) {
    data.lessonId = lesson.id
    return data
  }

  data.id = lesson.id

  const basicProps = [
    "type", "discipline", "building", "room", "conferenceUrl", "subgroup", "isIet", "isOnline",
  ] as const

  for (const prop of basicProps) {
    if ((lesson as any)[prop] !== original[prop]) {
      (data as any)[prop] = lesson[prop]
    }
  }

  if (lesson.teacher.id !== original?.teacher?.id) {
    data.teacherId = lesson.teacher.id
  }

  return data
}

export function applyCustomization(originalLesson: Omit<ScheduleLessonType, "alts">, custom: Partial<CustomizationData>) {
  const lesson = Object.assign({}, originalLesson)

  lesson.original = Object.assign({}, lesson);
  lesson.customized = {
    hidden: custom.hideLesson ?? lesson.customized?.hidden ?? false,
    disabled: !(custom.isEnabled ?? (!lesson.customized?.disabled)),
    customizedBy: custom.userId ?? lesson.customized?.customizedBy ?? -1,
    comment: custom.comment ?? lesson.customized?.comment ?? ""
  }

  const propsToCopy: Array<keyof typeof lesson & keyof CustomizationData> = [
    "discipline", "type", "isOnline", "isIet", "building", "room", "conferenceUrl", "subgroup", "dayTimeSlot"
  ]
  const changes: Partial<CustomizationData> = Object.fromEntries(Object.entries(custom).filter(([k, v]) => v && (propsToCopy as Array<string>).includes(k)))
  Object.assign(lesson, changes)
  if ("teacherId" in custom) lesson.teacher = {
    name: "???",
    id: custom.teacherId ?? null
  };
  lesson.id = custom.id!;

  return lesson;
}
