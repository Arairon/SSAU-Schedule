import nodeHtmlToImage from "node-html-to-image";

import { LessonType } from "@prisma/client";
import { TimeSlotMap, TimetableLesson, WeekTimetable } from "./schedule";
import { formatBigInt, getLessonDate, getPersonShortname } from "./utils";
import { StyleMap } from "./scheduleStyles/types";
import { SCHEDULE_STYLEMAP_DEFAULT } from "./scheduleStyles/default";
import log from "../logger";
import { db } from "../db";
import { env } from "../env";
import { readFileSync } from "node:fs";
import { SCHEDULE_STYLEMAP_NEON } from "./scheduleStyles/neon";
import { SCHEDULE_STYLEMAP_DARK } from "./scheduleStyles/dark";

const CSS = readFileSync(
  // TODO: Update with static for prod
  ".\\src\\template\\timetable.css",
);

const HTML_HEAD = `\
<!DOCTYPE html>
<html>
<head>
<!--<link rel="stylesheet" href="./timetable.css">-->
<meta charset="UTF-8">
</head>
<body class="bg-black flex flex-col gap-2 w-full items-stretch p-2">
<style>${CSS}</style>`;

const HTML_SIZER = `<style>body{width:{width};height:{height};}</style>\n`;

const HTML_HEADER_WEEK = `\
<header class="{headerStyle} items-center flex flex-col p-1">
<a class="text-lg font-bold">{name}, {weekNumber} неделя</a>
</header>`;

const HTML_NAV_OPEN = `<nav class="flex flex-row justify-between gap-2 font-bold text-center">`;

const HTML_HEADER_LESSONTYPE = `<div class="{style} flex-1 p-1">{name}</div>`;

// <div class="bg-red-400 rounded-lg flex-1 p-1">Практика</div>
// <div class="bg-purple-500 rounded-lg flex-1 p-1">Лабораторная</div>
// <div class="bg-orange-400 rounded-lg flex-1 p-1">Прочее</div>
// <div class="bg-pink-500 rounded-lg flex-1 p-1">Курсовая</div>
// <!-- <div class="bg-blue-400 rounded-lg flex-1 p-1">Консультация</div>
// <div class="bg-black rounded-lg flex-1 p-1 text-white outline-2 ountline-white">Экзамен</div> -->
const HTML_NAV_CLOSE = `
</nav>
<main class="grid gap-1 text-md leading-5 text-center grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr] grid-rows-auto">
<div class="{timeLabelStyle} rounded-lg font-bold p-2 flex flex-col justify-center">
Время
</div>
`;
const HTML_HEADER_WEEKDAY = `\
<div class="{style} rounded-lg font-bold p-2">
{weekday} {date}
</div>`;

const HTML_HEADER_TIMESLOT = `\
<div class="{style} rounded-lg font-bold p-2 flex flex-col justify-center">
{start}<hr>{end}
</div>
`;

const HTML_END = `\
</main>
</body>
</html>`;

const LESSON_GROUP_START = `<div class="flex flex-col gap-1">`;

const LESSON_START = `\
<div class="{cardStyle} flex-1">
<div class="{barStyle} p-1 rounded-xl"></div>
<div class="px-1 text-left">`;

const LESSON_BODY = `\
<p class="{nameStyle}">{name}</p>
<hr class="my-1">
<p class="{teacherStyle}">{teacherName}</p>
<p class="w-full flex flex-row items-center">
  <a class="flex-1 grow {placeStyle}">{place}</a>
  <a class="{subgroupStyle}">{subgroup}</a>
  <a class="{ietStyle}">{ietLabel}</a>
</p>`;

const LESSON_END = `</div></div>`;

const LESSON_GROUP_END = `</div>`;

const LESSON_WINDOW_BODY = `\
<p class="{nameStyle}">Окно</p>
`;

const EMPTY_WEEK_NOTICE = `
<div class="col-span-6 flex flex-col justify-center {style}">
  <a>{text}</a>
</div>
`;

export const STYLEMAPS: Record<string, StyleMap> = {
  default: SCHEDULE_STYLEMAP_DEFAULT,
  dark: SCHEDULE_STYLEMAP_DARK,
  neon: SCHEDULE_STYLEMAP_NEON,
};

function generateSingleLesson(
  lesson: TimetableLesson | null,
  opts?: { showGrouplist?: boolean; stylemap?: string },
) {
  if (lesson === null)
    return generateWindowLesson({ stylemap: opts?.stylemap });
  const stylemap = STYLEMAPS[opts?.stylemap ?? "default"];
  const style = stylemap.lessonTypes[lesson.type];
  const parts: string[] = [];
  parts.push(
    format(LESSON_START, {
      barStyle: style.barStyle,
      cardStyle: style.cardStyle,
    }),
  );
  parts.push(
    format(LESSON_BODY, {
      name: lesson.discipline,
      teacherName: lesson.teacher ? getPersonShortname(lesson.teacher) : "",
      place: lesson.isOnline ? "Online" : `${lesson.building} - ${lesson.room}`,
      subgroup: lesson.subgroup ? `Подгруппа: ${lesson.subgroup}` : "",
      nameStyle: style.nameStyle,
      teacherStyle: style.teacherStyle,
      placeStyle: style.placeStyle,
      subgroupStyle: style.subgroupStyle,
      ietStyle: lesson.isIet ? style.ietStyle : "hidden",
      ietLabel: style.ietLabel,
    }),
  );
  if (opts?.showGrouplist) {
    lesson.groups.sort();
    if (lesson.groups.length <= 4) {
      parts.push(
        ...[
          `<hr class="my-1"><p class="${style.groupListStyle}">`,
          ...lesson.groups.map((group) => `<a>${group}</a>`),
          `</p>`,
        ],
      );
    } else {
      parts.push(
        ...[
          `<hr class="my-1"><p class="${style.groupListStyle}">`,
          ...lesson.groups.slice(0, 3).map((group) => `<a>${group}</a>`),
          `<a>...</a>`,
          `</p>`,
        ],
      );
    }
  }

  parts.push(LESSON_END);

  return parts.join("");
}

function generateWindowLesson(opts?: { stylemap?: string }) {
  const stylemap = STYLEMAPS[opts?.stylemap ?? "default"];
  const style = stylemap.lessonTypes.Window;
  const parts: string[] = [];
  parts.push(
    format(LESSON_START, {
      barStyle: style.barStyle,
      cardStyle: style.cardStyle,
    }),
  );
  parts.push(format(LESSON_WINDOW_BODY, { nameStyle: style.nameStyle }));
  parts.push(LESSON_END);
  return parts.join("");
}

function generateLesson(
  lesson: TimetableLesson | null,
  opts?: { stylemap?: string; showGrouplist?: boolean },
) {
  if (lesson === null) {
    return (
      LESSON_GROUP_START +
      generateWindowLesson({ stylemap: opts?.stylemap }) +
      LESSON_GROUP_END
    );
  }
  const showGrouplist = opts?.showGrouplist && lesson.alts.length === 0;
  return (
    LESSON_GROUP_START +
    [lesson, ...lesson.alts]
      .map((lesson) =>
        generateSingleLesson(lesson, {
          showGrouplist: showGrouplist,
          stylemap: opts?.stylemap,
        }),
      )
      .join("") +
    LESSON_GROUP_END
  );
}

function format(string: string, values: Record<string, string>) {
  //console.debug(values);
  return string.replace(/\{(\w+)\}/g, function (x) {
    //console.debug(x, values[x.slice(1, x.length - 1)]);
    return values[x.slice(1, x.length - 1)] ?? x;
  });
}

const WEEKDAYS = [
  { short: "__", long: "____" },
  { short: "Пн", long: "Понедельник" },
  { short: "Вт", long: "Вторник" },
  { short: "Ср", long: "Среда" },
  { short: "Чт", long: "Четверг" },
  { short: "Пт", long: "Пятница" },
  { short: "Сб", long: "Суббота" },
  { short: "Вс", long: "Воскресенье" },
];

export async function generateTimetableImageHtml(
  timetable: WeekTimetable,
  opts?: {
    stylemap?: string;
  },
): Promise<string> {
  const stylemap = STYLEMAPS[opts?.stylemap ?? "default"];
  const scheduleName = timetable.isCommon
    ? ((await db.group.findUnique({ where: { id: timetable.groupId } }))
        ?.name ?? "#Группа не найдена#")
    : "Моё расписание";
  const page: string[] = [
    HTML_HEAD,
    format(HTML_SIZER, { width: "1600px", height: "auto" }),
    format(HTML_HEADER_WEEK, {
      name: scheduleName,
      weekNumber: `${timetable.week}`,
      headerStyle: stylemap.general.headers.main,
    }),
    HTML_NAV_OPEN,
    ...Object.values(stylemap.lessonTypes).map((style) =>
      format(HTML_HEADER_LESSONTYPE, {
        style: style.headerStyle,
        name: style.name,
      }),
    ),
    format(HTML_NAV_CLOSE, {
      timeLabelStyle: stylemap.general.headers.timeLabel,
    }),
  ];
  const cols: (string | null)[][] = [];
  let colHeight = 0;
  for (const day of timetable.days) {
    const date = getLessonDate(day.week, day.weekday);
    page.push(
      format(HTML_HEADER_WEEKDAY, {
        weekday: WEEKDAYS[day.weekday].short,
        date: `${date.getDate().toString().padStart(2, "0")}.${date.getMonth().toString().padStart(2, "0")}`,
        style: stylemap.general.headers.weekday,
      }),
    );
    const column: string[] = Array(8);
    if (day.lessons.length === 0) {
      cols.push(column);
      continue;
    }
    for (const lesson of day.lessons)
      column[lesson.dayTimeSlot - 1] = generateLesson(lesson, {
        stylemap: stylemap.name,
      });
    const latestLessonSlot = day.lessons.at(-1)?.dayTimeSlot ?? 0;
    colHeight = colHeight > latestLessonSlot ? colHeight : latestLessonSlot;
    cols.push(column);
  }
  if (colHeight === 0) {
    // Each day has 0 lessons
    page.push(
      format(HTML_HEADER_TIMESLOT, {
        start: TimeSlotMap[1].beginTime,
        end: TimeSlotMap.at(-1)!.endTime,
        style: stylemap.general.headers.timeslot,
      }),
    );
    page.push(format(EMPTY_WEEK_NOTICE, stylemap.general.emptyWeek));
  } else {
    for (let y = 0; y < colHeight; y++) {
      for (let x = -1; x < 6; x++) {
        if (x === -1) {
          page.push(
            format(HTML_HEADER_TIMESLOT, {
              start: TimeSlotMap[y + 1].beginTime,
              end: TimeSlotMap[y + 1].endTime,
              style: stylemap.general.headers.timeslot,
            }),
          );
          continue;
        }
        const lesson = cols[x][y];
        if (!lesson)
          page.push(generateLesson(null, { stylemap: opts?.stylemap }));
        else page.push(lesson);
      }
    }
  }
  page.push(HTML_END);
  return page.join("");
}

export async function generateTimetableImage(
  timetable: WeekTimetable,
  opts?: {
    stylemap?: string;
  },
): Promise<Buffer> {
  const html = await generateTimetableImageHtml(timetable, opts);
  const startTime = process.hrtime.bigint();
  const image = (await nodeHtmlToImage({
    html,
  })) as Buffer;
  const endTime = process.hrtime.bigint();
  log.debug(
    `Generated an image for week [F:${timetable.isCommon} I:${timetable.withIet}] ${opts?.stylemap ?? "default"}/${timetable.groupId}/${timetable.week}. Took ${formatBigInt(endTime - startTime)}ns`,
    { user: timetable.user },
  );
  return image;
}
