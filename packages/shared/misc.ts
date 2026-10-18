import { formatSentence, getPersonShortname } from "./utils";
import { TimeSlotMap } from "./timeSlotMap";
import type { LessonType, TimetableDiff, TimetableLesson } from "./timetable";
import { getWeekFromDate } from "./date";

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

export function getLessonTypeFromName(name: string): LessonType {
  const entry = Object.entries(LessonTypeName).find(
    ([, value]) => value === name,
  );
  if (!entry) {
    return "Unknown";
  }
  return entry[0] as LessonType;
}

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


type GenerateTextLessonListOptions = {
  separator?: string;
  showWindows?: boolean;
  groupContinous?: boolean
}
export function generateTextLessonList(lessons: TimetableLesson[],
  {
    separator = "-----",
    showWindows = false,
    groupContinous = false
  }: GenerateTextLessonListOptions): string {
  if (groupContinous)
    lessons = groupContinousLessons(lessons)
  if (!showWindows)
    return lessons.map(generateTextLesson).join(`\n${separator}\n`);
  if (!lessons.length) return ""
  const parts: string[] = []
  let prevTimeSlot = lessons[0].dayTimeSlot - 1
  for (const l of lessons) {
    console.dir({ prevTimeSlot, cur: l.dayTimeSlot })
    if (l.dayTimeSlot - prevTimeSlot > 1) {
      parts.push(generateTextWindowLesson(prevTimeSlot + 1, l.dayTimeSlot - prevTimeSlot - 1))
    }
    prevTimeSlot = l.dayTimeSlot
    parts.push(generateTextLesson(l))
  }

  return parts.join(`\n${separator}\n`)
}

function generateTextWindowLesson(slot?: number, length?: number): string {
  console.dir({ slot, length })
  if (slot) {
    /* 
    // time diff variant
    let beginTime = TimeSlotMap[slot - 1].beginTime
    let endTime = TimeSlotMap[slot + (length ?? 0)].beginTime
    */
    let beginTime = TimeSlotMap[slot].beginTime
    let endTime = TimeSlotMap[slot + (length ?? 1) - 1].endTime
    return `
📆 ${beginTime} - ${endTime}
🏝 Окно
`.trim()
  }
  return `
🏝 Окно
`.trim()
}

export function generateTextLesson(lesson: TimetableLesson): string {
  const timeslot = TimeSlotMap[lesson.dayTimeSlot];
  const place = lesson.isOnline
    ? `Online (${lesson.conferenceUrl ?? "ссылка отсутствует"})`
    : `${lesson.building} - ${lesson.room}`;
  const subgroupStr = lesson.subgroup ? `👥 Подгруппа: ${lesson.subgroup}` : "";
  return [
    `\
📆 ${timeslot.beginTime} - ${lesson.type === "Military" ? "17:00" : timeslot.endTime}
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
  lesson: TimetableLesson,
  options?: {
    showDate?: boolean;
    dateFormat?: Intl.DateTimeFormatOptions;
    showSubgroup?: boolean;
    nameOverride?: string;
  },
): string {
  const opts = Object.assign(
    {
      showDate: true,
      dateFormat: {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
      },
      showSubgroup: false,
      nameOverride: undefined,
    },
    options,
  );
  const date = formatSentence(
    lesson.beginTime.toLocaleDateString("ru-RU", opts.dateFormat),
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
    ? `Online (${lesson.conferenceUrl ?? "n/a"})`
    : `${lesson.building} - ${lesson.room}`;
  return `\
${opts.showDate ? `📆 ${date} / ` : ""}\
${startTime} - ${endTime}\
${opts.showSubgroup && lesson.subgroup ? ` / 👥 ${lesson.subgroup}` : ""}
${LessonTypeIcon[lesson.type]} ${opts.nameOverride ?? lesson.discipline} (${place}) ${lesson.isIet ? "[ИОТ]" : ""}`;
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
    if (!(a.lesson.beginTime instanceof Date)) a.lesson.beginTime = new Date(a.lesson.beginTime);
    if (!(b.lesson.beginTime instanceof Date)) b.lesson.beginTime = new Date(b.lesson.beginTime);
    const timeDiff = a.lesson.beginTime.getTime() - b.lesson.beginTime.getTime();
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
export function convertLessonToTimetableLesson(lesson: {
  id: number;
  infoId: number;
  type: LessonType;
  discipline: string;
  teacher: { name: string; id: number | null };
  teacherId: number | null;
  isOnline: boolean;
  building: string | null;
  room: string | null;
  isIet: boolean;
  subgroup: number | null;
  groups?: { name: string }[];
  flows?: { name: string }[];
  dayTimeSlot: number;
  beginTime: Date;
  endTime: Date;
  conferenceUrl: string | null;
}): TimetableLesson {
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

export type RequestStateUpdateWithData<T extends string, K> = {
  data: K;
} & RequestStateUpdate<T>;

export function groupContinousLessons(
  lessons: TimetableLesson[],
): TimetableLesson[] {
  if (lessons.length === 0) return [];
  const sortedLessons = [...lessons].sort(
    (a, b) => a.beginTime.getTime() - b.beginTime.getTime(),
  );
  const grouped: TimetableLesson[] = [];
  let currentGroup = [sortedLessons[0]];

  for (let i = 1; i < sortedLessons.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = sortedLessons[i];
    if (
      prev.discipline === curr.discipline &&
      prev.teacher.id === curr.teacher.id &&
      prev.type === curr.type &&
      prev.isOnline === curr.isOnline &&
      prev.building === curr.building &&
      prev.room === curr.room &&
      prev.subgroup === curr.subgroup &&
      prev.groups.join(",") === curr.groups.join(",") &&
      prev.flows.join(",") === curr.flows.join(",") &&
      curr.dayTimeSlot === prev.dayTimeSlot + 1
    ) {
      currentGroup.push(curr);
    } else {
      grouped.push(
        currentGroup.length > 1
          ? {
            ...currentGroup[0],
            endTime: currentGroup.at(-1)!.endTime,
          }
          : prev,
      );
      currentGroup = [curr];
    }
  }
  // Push the last group
  grouped.push(
    currentGroup.length > 1
      ? {
        ...currentGroup[0],
        endTime: currentGroup.at(-1)!.endTime,
      }
      : currentGroup[0],
  );

  return grouped;
}

export function getTargetWeekNumber(requestedNumber: number, options: {
  incrementOnSunday?: boolean,
  clamp?: boolean
} = {}): number {
  const opts = Object.assign({
    incrementOnSunday: true,
    clamp: true
  }, options)

  if (requestedNumber === 0) {
    const now = new Date()
    requestedNumber = getWeekFromDate(now)
    if (opts.incrementOnSunday && now.getDay() === 0) {
      requestedNumber++
    }
  }

  if (opts.clamp) {
    requestedNumber = Math.min(Math.max(requestedNumber, 1), 52)
  }

  return requestedNumber
}
