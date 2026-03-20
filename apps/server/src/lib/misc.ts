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
  trustedLessonCustomizers: number[]; // User IDs whose shared custom lessons this user wants to see
};

export const UserPreferencesDefaults: UserPreferences = {
  theme: "neon",
  showIet: true,
  showMilitary: false,
  notifyBeforeLessons: 0,
  notifyAboutNextLesson: false,
  notifyAboutNextDay: false,
  notifyAboutNextWeek: false,
  trustedLessonCustomizers: [],
};

export function getUserPreferences(user: User): UserPreferences {
  return Object.assign({}, UserPreferencesDefaults, user.preferences ?? {});
}

export const LessonTypeIcon: Record<LessonType, string> = {
  Lection: "📗",
  Practice: "📕",
  Lab: "📘",
  Other: "📙",
  Military: "🫡",
  Window: "🏝",
  Exam: "💀",
  Consult: "🗨",
  CourseWork: "📓",
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
  CourseWork: "Курсовая",
  // Test: "Тест",
  Unknown: "Неизвестно",
};

export const LessonFieldsNames = {
  id: "id",
  infoId: "infoId",
  type: "Тип",
  discipline: "Предмет",
  teacher: "Преподаватель",
  isOnline: "Онлайн",
  building: "Корпус",
  room: "Аудитория",
  isIet: "ИОТ",
  subgroup: "Подгруппа",
  groups: "Группы",
  flows: "Потоки",
  dayTimeSlot: "Номер пары в день",
  beginTime: "Время начала",
  endTime: "Время окончания",
  conferenceUrl: "Ссылка на конференцию",
  original: "Оригинал",
  customized: "Настройка",
  alts: "Альтернативные варианты",
} as const satisfies Record<keyof TimetableLesson, string>;

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

export function formatLesson(
  lesson: Lesson | TimetableLesson,
  options?: { showDate?: boolean },
): string {
  const opts = Object.assign({ showDate: true }, options);
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
${opts.showDate ? `📆 ${date} / ` : ""}\
${startTime} - ${endTime}
${LessonTypeIcon[lesson.type]} ${lesson.discipline} (${place}) ${lesson.isIet ? "[ИОТ]" : ""}`;
}

export function mapLessonsToDays(lessons: TimetableLesson[]) {
  const days: TimetableLesson[][] = [[], [], [], [], [], []]; // 6 days
  for (const lesson of lessons) {
    const weekday = lesson.beginTime.getDay(); // 1-6
    days[weekday - 1].push(lesson);
  }
  return days;
}

export function formatTimetableDiff(
  diff: TimetableDiff,
  type: "short" | "long" = "short",
  limit = 0,
): string {
  if (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.modified.length === 0
  ) {
    return "";
  }
  const changes: {
    type: "added" | "removed" | "modified";
    lesson: TimetableLesson;
    old?: Partial<TimetableLesson>;
  }[] = [
    ...diff.added.map((lesson) => ({ type: "added" as const, lesson })),
    ...diff.removed.map((lesson) => ({ type: "removed" as const, lesson })),
    ...diff.modified.map(({ old, new: lesson }) => ({
      type: "modified" as const,
      old,
      lesson,
    })),
  ];
  const typePriority: Record<(typeof changes)[number]["type"], number> = {
    modified: 0,
    removed: 1,
    added: 2,
  };
  changes.sort((a, b) => {
    const timeDiff =
      a.lesson.beginTime.getTime() - b.lesson.beginTime.getTime();
    if (timeDiff !== 0) return timeDiff;

    return typePriority[a.type] - typePriority[b.type];
  }); // For equal times: modified first, then removed, then added

  const parts: string[] = [];

  let limitLeft = limit || -1;
  let dayIndex = 0;
  for (; dayIndex < 6; dayIndex++) {
    const dayChanges = changes.filter(
      (c) => c.lesson.beginTime.getDay() === dayIndex + 1,
    );
    if (dayChanges.length === 0) continue;

    const dayName = formatSentence(
      dayChanges[0].lesson.beginTime.toLocaleDateString("ru-RU", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
      }),
    );

    parts.push(`${dayIndex > 0 ? "\n" : ""}📅 ${dayName}:`);

    for (const change of dayChanges.slice(
      0,
      limitLeft >= 0 ? limitLeft : undefined,
    )) {
      let prefix = "";
      if (change.type === "added") prefix = "+";
      else if (change.type === "removed") prefix = "-";
      else if (change.type === "modified") prefix = "±";

      const lesson = change.lesson;
      if (type === "long") {
        parts.push(`${prefix} ${formatLesson(lesson)}`);
        continue;
      }
      const startTime = lesson.beginTime.toLocaleTimeString("ru-RU", {
        hour: "numeric",
        minute: "numeric",
      });
      const place = lesson.isOnline
        ? `Online`
        : `${lesson.building}-${lesson.room}`;
      const subgroup = lesson.subgroup ? `👥${lesson.subgroup} ` : "";
      parts.push(
        `${prefix} ${startTime} ${LessonTypeIcon[lesson.type]} ${lesson.discipline} ${subgroup} [${place}] `,
      );
      if (change.type === "modified" && change.old) {
        let changedLocationFlag = false;
        for (const [k, v] of Object.entries(change.old) as [
          keyof TimetableLesson,
          TimetableLesson[keyof TimetableLesson],
        ][]) {
          if (k === "id" || k === "infoId") continue; // Ignore these fields in modified lessons
          if (k === "teacher") {
            const oldName = (v as { id: number; name: string }).name;
            parts.push(
              `  - ${LessonFieldsNames.teacher}: ${getPersonShortname(oldName)} → ${getPersonShortname(lesson.teacher.name)}`,
            );
          } else if (k === "room" || k === "building") {
            if (changedLocationFlag) continue;
            changedLocationFlag = true;
            const oldPlace = `${change.old.building ?? lesson.building}-${change.old.room ?? lesson.room}`;
            const newPlace = `${lesson.building}-${lesson.room}`;
            parts.push(
              `  - ${LessonFieldsNames.room}: ${oldPlace} → ${newPlace}`,
            );
          } else {
            const fieldName = LessonFieldsNames[k] ?? k;
            if (typeof v === "boolean") {
              parts.push(
                `  - ${fieldName}: ${v ? "Да" : "Нет"} → ${lesson[k] ? "Да" : "Нет"}`,
              );
            } else {
              parts.push(
                `  - ${fieldName}: ${JSON.stringify(v)} → ${JSON.stringify(lesson[k])}`,
              );
            }
          }
        }
      }
    }
    if (limit && limitLeft < dayChanges.length) {
      if (dayChanges.length > limitLeft) {
        parts.push(`... и еще ${dayChanges.length - limitLeft} изменений`);
      }
      limitLeft = 0;
      dayIndex++; // Move to next day for the "remaining changes" section
      break;
    } else {
      limitLeft -= dayChanges.length;
    }
  }
  const remainingChanges = limit ? changes.slice(limit) : [];
  if (remainingChanges.length > 0) {
    parts.push(""); // newline before remaining changes
    for (; dayIndex < 6; dayIndex++) {
      const dayChanges = remainingChanges.filter(
        (c) => c.lesson.beginTime.getDay() === dayIndex + 1,
      );
      if (dayChanges.length === 0) continue;
      const dayName = formatSentence(
        dayChanges[0].lesson.beginTime.toLocaleDateString("ru-RU", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
        }),
      );
      parts.push(`📅 ${dayName}: ${dayChanges.length} изменений`);
    }
  }

  return parts.join("\n");
}

/**
 * Converts a Prisma Lesson model (with included relations) to a TimetableLesson
 * @param lesson Prisma Lesson with teacher, groups, and/or flows included
 * @returns TimetableLesson ready for use in timetables
 */
export function lessonToTimetableLesson(
  lesson: Lesson & {
    teacher: { name: string; id: number };
    groups?: { name: string }[];
    flows?: { name: string }[];
  },
): TimetableLesson {
  const timetableLesson: TimetableLesson = {
    id: lesson.id,
    infoId: lesson.infoId,
    type: lesson.type,
    discipline: formatSentence(lesson.discipline),
    teacher: {
      name: lesson.teacher.name,
      id: lesson.teacherId,
    },
    isOnline: lesson.isOnline,
    isIet: lesson.isIet,
    building: lesson.building,
    room: lesson.room,
    subgroup: lesson.subgroup,
    groups: lesson.groups?.map((g) => g.name) ?? [],
    flows: lesson.flows?.map((f) => f.name) ?? [],
    dayTimeSlot: lesson.dayTimeSlot,
    beginTime: lesson.beginTime,
    endTime: lesson.endTime,
    conferenceUrl: lesson.conferenceUrl,
    alts: [],
    customized: null,
    original: null,
  };

  return timetableLesson;
}

export type RequestStateUpdate<T extends string> = {
  state: T;
  message?: string;
};
