import { type Lesson, LessonType, type User } from "@/generated/prisma/client";
import type { MessageEntity } from "grammy/types";
import { db } from "@/db";
import { type TeacherType } from "@/ssau/schemas/schedule";
import {
  formatSentence,
  getPersonShortname,
} from "@ssau-schedule/shared/utils";
import { TimeSlotMap } from "@ssau-schedule/shared/timeSlotMap";
import type {
  TimetableDiff,
  TimetableLesson,
} from "@/schedule/types/timetable";

export type UserPreferences = {
  theme: string;
  showIet: boolean;
  showMilitary: boolean;
  notifyBeforeLessons: number;
  notifyAboutNextLesson: boolean;
  notifyAboutNextDay: boolean;
  notifyAboutNextWeek: boolean;
};

export const UserPreferencesDefaults: UserPreferences = {
  theme: "neon",
  showIet: true,
  showMilitary: false,
  notifyBeforeLessons: 0,
  notifyAboutNextLesson: false,
  notifyAboutNextDay: false,
  notifyAboutNextWeek: false,
};

export const LessonTypeIcon: Record<LessonType, string> = {
  Lection: "📗",
  Practice: "📕",
  Lab: "📘",
  Other: "📙",
  Military: "🫡",
  Window: "🏝",
  Exam: "💀",
  Consult: "🗨",
  // CourseWork: "🤯",
  // Test: "📝",
  Unknown: "❓",
};

export const LessonTypeName: Record<LessonType, string> = {
  Lection: "Лекция",
  Practice: "Практика",
  Lab: "Лабораторная",
  Other: "Другое",
  Military: "Воен. Каф.",
  Window: "Окно",
  Exam: "Экзамен",
  Consult: "Консультация",
  // CourseWork: "Курсовая",
  // Test: "Тест",
  Unknown: "Неизвестно",
};

export const DayString: { normal: string; in: string }[] = [
  { normal: "воскресенье", in: "в воскресенье" },
  { normal: "понедельник", in: "в понедельник" },
  { normal: "вторник", in: "во вторник" },
  { normal: "среда", in: "в среду" },
  { normal: "четверг", in: "в четверг" },
  { normal: "пятница", in: "в пятницу" },
  { normal: "суббота", in: "в субботу" },
];

export async function ensureGroupExists(group: {
  id: number;
  name: string;
  specId?: number;
  specName?: string;
  spec?: { id: number; name: string };
}) {
  const data = {
    id: group.id,
    name: group.name,
    specId: group.specId ?? group.spec?.id ?? undefined,
    specName: group.specName ?? group.spec?.name ?? undefined,
  };
  await db.group.upsert({
    where: { id: group.id },
    update: data,
    create: data,
  });
}

export async function ensureFlowExists(flow: {
  id: number;
  name: string;
  disciplineId?: number;
  disciplineName?: string;
  discipline?: { id: number; name: string };
}) {
  const data = {
    id: flow.id,
    name: flow.name,
    disciplineId: flow.disciplineId ?? flow.discipline?.id ?? undefined,
    disciplineName: flow.disciplineName ?? flow.discipline?.name ?? undefined,
  };
  await db.flow.upsert({
    where: { id: flow.id },
    update: data,
    create: data,
  });
}

export async function ensureTeacherExists(teacher: TeacherType) {
  const data = {
    id: teacher.id,
    name: teacher.name,
    shortname: getPersonShortname(teacher.name),
    state: teacher.state,
  };
  await db.teacher.upsert({
    where: { id: teacher.id },
    update: data,
    create: data,
  });
}

export async function scheduleMessage(
  user: User,
  sendAt: Date,
  text: string,
  opts?: { entities?: MessageEntity[]; image?: string; source?: string },
) {
  await db.scheduledMessage.create({
    data: {
      chatId: `${user.tgId}`,
      text,
      sendAt,
      entities: opts?.entities as object[],
      image: opts?.image,
      source: opts?.source,
    },
  });
}

export function generateTextLesson(lesson: TimetableLesson): string {
  const timeslot = TimeSlotMap[lesson.dayTimeSlot];
  const place = lesson.isOnline
    ? `Online (${lesson.conferenceUrl ?? "ссылка отсутствует"})`
    : `${lesson.building} - ${lesson.room}`;
  const subgroupStr = lesson.subgroup ? `👥 Подгруппа: ${lesson.subgroup}` : "";
  return [
    `\
📆 ${timeslot.beginTime} - ${lesson.type === LessonType.Military ? "♾️" : timeslot.endTime}
📖 ${lesson.discipline}
${LessonTypeIcon[lesson.type]} ${LessonTypeName[lesson.type]} ${lesson.isIet ? "[ИОТ]" : ""}
🏢 ${place}
👤 ${lesson.teacher.name}
${subgroupStr}`
      .replace("\n\n", "\n")
      .trim(),
    ...lesson.alts.map(generateTextLesson),
  ].join("\n+\n");
}

export function formatLesson(lesson: Lesson | TimetableLesson) {
  const date = formatSentence(
    lesson.beginTime.toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
    }),
  );
  const startTime = lesson.beginTime.toLocaleTimeString("ru-RU", {
    hour: "numeric",
    minute: "numeric",
  });
  const endTime = lesson.endTime.toLocaleTimeString("ru-RU", {
    hour: "numeric",
    minute: "numeric",
  });
  const place = lesson.isOnline
    ? `Online (${lesson.conferenceUrl ?? "ссылка отсутствует"})`
    : `${lesson.building} - ${lesson.room}`;
  return `\
${date} / ${startTime} - ${endTime}
${LessonTypeIcon[lesson.type]} ${lesson.discipline} (${place}) ${lesson.isIet ? "[ИОТ]" : ""}`;
}

export function formatTimetableDiff(diff: TimetableDiff, limit = 0): string {
  const { added, removed } = diff;
  if (added.length === 0 && removed.length === 0) {
    return "";
  }
  const parts: string[] = ["Обнаружены изменения в расписании!"];

  if (added.length > 0) {
    parts.push(`\nДобавлены занятия:`);
    for (const lesson of added.slice(0, limit || undefined)) {
      parts.push(formatLesson(lesson));
    }
    if (limit > 0 && added.length > limit) {
      parts.push(`\n...и ещё ${added.length - limit} занятий`);
    }
  }

  if (removed.length > 0) {
    parts.push(`\nУдалены занятия:`);
    for (const lesson of removed.slice(0, limit || undefined)) {
      parts.push(formatLesson(lesson));
    }
    if (limit > 0 && removed.length > limit) {
      parts.push(`\n...и ещё ${removed.length - limit} занятий`);
    }
  }

  return parts.join("\n");
}

export type RequestStateUpdate<T extends string> = {
  state: T;
  message?: string;
};
