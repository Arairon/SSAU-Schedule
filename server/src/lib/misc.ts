import axios from "axios";
import { type Lesson, LessonType, type User } from "@prisma/client";
import type { MessageEntity } from "grammy/types";
import { db } from "../db";
import { type TeacherType } from "./scheduleSchemas";
import { formatSentence, getPersonShortname } from "./utils";
import log from "../logger";
import { TimeSlotMap, type TimetableLesson } from "./schedule";

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
  theme: "default",
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

type GroupTeacherSearchResponse = {
  id: number;
  url: string;
  text: string;
};
export async function findGroupsInSsau(
  text: string,
): Promise<GroupTeacherSearchResponse[]> {
  log.debug(`Trying to find '${text}' in ssau.ru/rasp`);
  try {
    const page = await axios.get("https://ssau.ru/rasp", {
      withCredentials: true,
      responseType: "text",
    });
    const cookies: string[] = [];
    page.headers["set-cookie"]?.forEach((cookie) => {
      cookies.push(cookie.split(";")[0]);
    });
    const csrfRegex = /name="csrf-token".{0,3}content="(\w+)".{0,3}\/>/m;
    const execResult = csrfRegex.exec((page.data as string).slice(0, 200));
    const token = execResult ? execResult[1] : undefined;
    const resp = await axios.post(
      "https://ssau.ru/rasp/search",
      `text=${encodeURI(text)}`,
      {
        headers: {
          "X-CSRF-TOKEN": token,
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookies.join(";"),
        },
        withCredentials: true,
      },
    );
    const options = resp.data as GroupTeacherSearchResponse[];
    options.map(
      (group) => void ensureGroupExists({ id: group.id, name: group.text }),
    );
    return options;
  } catch {
    log.warn(`Search for '${text}' in ssau.ru/rasp failed.`);
    return [];
  }
}

export async function findGroup(
  inp: { groupName?: string; groupId?: number } & (
    | { groupName: string }
    | { groupId: number }
  ),
) {
  const group = await findGroupOrOptions(inp);
  if (Array.isArray(group)) {
    if (group.length === 1) return group[0];
  } else {
    return group;
  }
  return null;
}

export async function findGroupOrOptions(
  inp: { groupName?: string; groupId?: number } & (
    | { groupName: string }
    | { groupId: number }
  ),
) {
  if (inp.groupId) {
    const group = await db.group.findUnique({ where: { id: inp.groupId } });
    if (group) return group;
  }
  if (inp.groupName) {
    const name = inp.groupName.trim();
    if (name.length >= 11) {
      // 6101-090301 (D optional)
      const existingGroup = await db.group.findFirst({
        where: { name: { startsWith: name } },
      });
      if (existingGroup) return existingGroup;
    } else {
      const existingGroup = await db.group.findFirst({
        where: { name: name },
      });
      if (existingGroup) return existingGroup;
    }
    const possibleGroups = await findGroupsInSsau(name);
    return possibleGroups;
  }
  return null;
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
👤 ${lesson.teacher}
${subgroupStr}`
      .replace("\n\n", "\n")
      .trim(),
    ...lesson.alts.map(generateTextLesson),
  ].join("\n+\n");
}

export function formatDbLesson(lesson: Lesson) {
  const date = formatSentence(
    lesson.date.toLocaleDateString("ru-RU", {
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
  return `${date} / ${startTime} - ${endTime}\n${LessonTypeIcon[lesson.type]} ${lesson.discipline} ${lesson.isIet ? "[ИОТ]" : ""}`;
}
