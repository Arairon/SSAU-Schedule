import { readFileSync } from "node:fs";
import nodeHtmlToImage from "node-html-to-image";

import {
  TimeSlotMap,
  type TimetableLesson,
  type WeekTimetable,
} from "./schedule";
import { formatBigInt, getLessonDate, getPersonShortname } from "./utils";
import { type StyleMap } from "./scheduleStyles/types";
import log from "../logger";
import { db } from "../db";
import { env } from "../env";
import { SCHEDULE_STYLEMAP_DEFAULT } from "./scheduleStyles/default";
import { SCHEDULE_STYLEMAP_NEON } from "./scheduleStyles/neon";
import { SCHEDULE_STYLEMAP_DARK } from "./scheduleStyles/dark";

//#region Static css
const STATIC_CSS = `@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){*,:before,:after,::backdrop{--tw-rotate-x:initial;--tw-rotate-y:initial;--tw-rotate-z:initial;--tw-skew-x:initial;--tw-skew-y:initial;--tw-border-style:solid;--tw-leading:initial;--tw-font-weight:initial;--tw-outline-style:solid}}}@layer theme{:root,:host{--font-sans:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";--font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;--color-red-400:oklch(70.4% .191 22.216);--color-red-950:oklch(25.8% .092 26.042);--color-orange-400:oklch(75% .183 55.934);--color-orange-950:oklch(26.6% .079 36.259);--color-yellow-400:oklch(85.2% .199 91.936);--color-yellow-900:oklch(42.1% .095 57.708);--color-yellow-950:oklch(28.6% .066 53.813);--color-green-400:oklch(79.2% .209 151.711);--color-green-600:oklch(62.7% .194 149.214);--color-green-950:oklch(26.6% .065 152.934);--color-cyan-200:oklch(91.7% .08 205.041);--color-cyan-400:oklch(78.9% .154 211.53);--color-cyan-600:oklch(60.9% .126 221.723);--color-cyan-700:oklch(52% .105 223.128);--color-cyan-800:oklch(45% .085 224.283);--color-cyan-900:oklch(39.8% .07 227.392);--color-blue-400:oklch(70.7% .165 254.624);--color-blue-950:oklch(28.2% .091 267.935);--color-purple-400:oklch(71.4% .203 305.504);--color-purple-500:oklch(62.7% .265 303.9);--color-purple-950:oklch(29.1% .149 302.717);--color-pink-400:oklch(71.8% .202 349.761);--color-pink-500:oklch(65.6% .241 354.308);--color-pink-950:oklch(28.4% .109 3.907);--color-slate-300:oklch(86.9% .022 252.894);--color-slate-400:oklch(70.4% .04 256.788);--color-slate-500:oklch(55.4% .046 257.417);--color-slate-600:oklch(44.6% .043 257.281);--color-slate-800:oklch(27.9% .041 260.031);--color-slate-900:oklch(20.8% .042 265.755);--color-gray-700:oklch(37.3% .034 259.733);--color-black:#000;--color-white:#fff;--spacing:.25rem;--text-xs:.75rem;--text-xs--line-height:calc(1/.75);--text-lg:1.125rem;--text-lg--line-height:calc(1.75/1.125);--font-weight-bold:700;--radius-lg:.5rem;--radius-xl:.75rem;--default-font-family:var(--font-sans);--default-mono-font-family:var(--font-mono)}}@layer base{*,:after,:before,::backdrop{box-sizing:border-box;border:0 solid;margin:0;padding:0}::file-selector-button{box-sizing:border-box;border:0 solid;margin:0;padding:0}html,:host{-webkit-text-size-adjust:100%;tab-size:4;line-height:1.5;font-family:var(--default-font-family,ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji");font-feature-settings:var(--default-font-feature-settings,normal);font-variation-settings:var(--default-font-variation-settings,normal);-webkit-tap-highlight-color:transparent}hr{height:0;color:inherit;border-top-width:1px}abbr:where([title]){-webkit-text-decoration:underline dotted;text-decoration:underline dotted}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,kbd,samp,pre{font-family:var(--default-mono-font-family,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace);font-feature-settings:var(--default-mono-font-feature-settings,normal);font-variation-settings:var(--default-mono-font-variation-settings,normal);font-size:1em}small{font-size:80%}sub,sup{vertical-align:baseline;font-size:75%;line-height:0;position:relative}sub{bottom:-.25em}sup{top:-.5em}table{text-indent:0;border-color:inherit;border-collapse:collapse}:-moz-focusring{outline:auto}progress{vertical-align:baseline}summary{display:list-item}ol,ul,menu{list-style:none}img,svg,video,canvas,audio,iframe,embed,object{vertical-align:middle;display:block}img,video{max-width:100%;height:auto}button,input,select,optgroup,textarea{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}::file-selector-button{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}:where(select:is([multiple],[size])) optgroup{font-weight:bolder}:where(select:is([multiple],[size])) optgroup option{padding-inline-start:20px}::file-selector-button{margin-inline-end:4px}::placeholder{opacity:1}@supports (not ((-webkit-appearance:-apple-pay-button))) or (contain-intrinsic-size:1px){::placeholder{color:currentColor}@supports (color:color-mix(in lab, red, red)){::placeholder{color:color-mix(in oklab,currentcolor 50%,transparent)}}}textarea{resize:vertical}::-webkit-search-decoration{-webkit-appearance:none}::-webkit-date-and-time-value{min-height:1lh;text-align:inherit}::-webkit-datetime-edit{display:inline-flex}::-webkit-datetime-edit-fields-wrapper{padding:0}::-webkit-datetime-edit{padding-block:0}::-webkit-datetime-edit-year-field{padding-block:0}::-webkit-datetime-edit-month-field{padding-block:0}::-webkit-datetime-edit-day-field{padding-block:0}::-webkit-datetime-edit-hour-field{padding-block:0}::-webkit-datetime-edit-minute-field{padding-block:0}::-webkit-datetime-edit-second-field{padding-block:0}::-webkit-datetime-edit-millisecond-field{padding-block:0}::-webkit-datetime-edit-meridiem-field{padding-block:0}::-webkit-calendar-picker-indicator{line-height:1}:-moz-ui-invalid{box-shadow:none}button,input:where([type=button],[type=reset],[type=submit]){appearance:button}::file-selector-button{appearance:button}::-webkit-inner-spin-button{height:auto}::-webkit-outer-spin-button{height:auto}[hidden]:where(:not([hidden=until-found])){display:none!important}}@layer components;@layer utilities{.relative{position:relative}.static{position:static}.col-span-6{grid-column:span 6/span 6}.my-1{margin-block:calc(var(--spacing)*1)}.flex{display:flex}.grid{display:grid}.hidden{display:none}.table{display:table}.w-full{width:100%}.flex-1{flex:1}.grow{flex-grow:1}.transform{transform:var(--tw-rotate-x,)var(--tw-rotate-y,)var(--tw-rotate-z,)var(--tw-skew-x,)var(--tw-skew-y,)}.grid-flow-col{grid-auto-flow:column}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-cols-\\[auto_1fr_1fr_1fr_1fr_1fr_1fr\\]{grid-template-columns:auto 1fr 1fr 1fr 1fr 1fr 1fr}.grid-rows-2{grid-template-rows:repeat(2,minmax(0,1fr))}.flex-col{flex-direction:column}.flex-row{flex-direction:row}.items-center{align-items:center}.items-stretch{align-items:stretch}.justify-between{justify-content:space-between}.justify-center{justify-content:center}.justify-end{justify-content:flex-end}.gap-1{gap:calc(var(--spacing)*1)}.gap-2{gap:calc(var(--spacing)*2)}.rounded-lg{border-radius:var(--radius-lg)}.rounded-xl{border-radius:var(--radius-xl)}.border-2{border-style:var(--tw-border-style);border-width:2px}.border-dashed{--tw-border-style:dashed;border-style:dashed}.border-blue-400{border-color:var(--color-blue-400)}.border-cyan-600{border-color:var(--color-cyan-600)}.border-green-400{border-color:var(--color-green-400)}.border-orange-400{border-color:var(--color-orange-400)}.border-pink-400{border-color:var(--color-pink-400)}.border-purple-400{border-color:var(--color-purple-400)}.border-purple-500{border-color:var(--color-purple-500)}.border-red-400{border-color:var(--color-red-400)}.border-slate-500{border-color:var(--color-slate-500)}.border-slate-600{border-color:var(--color-slate-600)}.border-white{border-color:var(--color-white)}.border-yellow-400{border-color:var(--color-yellow-400)}.bg-black{background-color:var(--color-black)}.bg-blue-400{background-color:var(--color-blue-400)}.bg-blue-950{background-color:var(--color-blue-950)}.bg-cyan-200{background-color:var(--color-cyan-200)}.bg-cyan-400{background-color:var(--color-cyan-400)}.bg-cyan-700{background-color:var(--color-cyan-700)}.bg-cyan-800{background-color:var(--color-cyan-800)}.bg-cyan-900{background-color:var(--color-cyan-900)}.bg-gray-700{background-color:var(--color-gray-700)}.bg-green-400{background-color:var(--color-green-400)}.bg-green-600{background-color:var(--color-green-600)}.bg-green-950{background-color:var(--color-green-950)}.bg-orange-400{background-color:var(--color-orange-400)}.bg-orange-950{background-color:var(--color-orange-950)}.bg-pink-500{background-color:var(--color-pink-500)}.bg-pink-950{background-color:var(--color-pink-950)}.bg-purple-500{background-color:var(--color-purple-500)}.bg-purple-950{background-color:var(--color-purple-950)}.bg-red-400{background-color:var(--color-red-400)}.bg-red-950{background-color:var(--color-red-950)}.bg-slate-300{background-color:var(--color-slate-300)}.bg-slate-800{background-color:var(--color-slate-800)}.bg-slate-900{background-color:var(--color-slate-900)}.bg-white{background-color:var(--color-white)}.bg-white\\/90{background-color:#ffffffe6}@supports (color:color-mix(in lab, red, red)){.bg-white\\/90{background-color:color-mix(in oklab,var(--color-white)90%,transparent)}}.bg-yellow-900{background-color:var(--color-yellow-900)}.bg-yellow-950{background-color:var(--color-yellow-950)}.p-1{padding:calc(var(--spacing)*1)}.p-2{padding:calc(var(--spacing)*2)}.px-1{padding-inline:calc(var(--spacing)*1)}.px-2{padding-inline:calc(var(--spacing)*2)}.py-2{padding-block:calc(var(--spacing)*2)}.py-12{padding-block:calc(var(--spacing)*12)}.py-\\[0\\.25\\]{padding-block:.25px}.text-center{text-align:center}.text-left{text-align:left}.text-lg{font-size:var(--text-lg);line-height:var(--tw-leading,var(--text-lg--line-height))}.text-xs{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}.leading-5{--tw-leading:calc(var(--spacing)*5);line-height:calc(var(--spacing)*5)}.font-bold{--tw-font-weight:var(--font-weight-bold);font-weight:var(--font-weight-bold)}.text-slate-600{color:var(--color-slate-600)}.text-white{color:var(--color-white)}.italic{font-style:italic}.outline-2{outline-style:var(--tw-outline-style);outline-width:2px}.outline-purple-500{outline-color:var(--color-purple-500)}.outline-slate-400{outline-color:var(--color-slate-400)}.outline-white{outline-color:var(--color-white)}.outline-dashed{--tw-outline-style:dashed;outline-style:dashed}}@property --tw-rotate-x{syntax:"*";inherits:false}@property --tw-rotate-y{syntax:"*";inherits:false}@property --tw-rotate-z{syntax:"*";inherits:false}@property --tw-skew-x{syntax:"*";inherits:false}@property --tw-skew-y{syntax:"*";inherits:false}@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}@property --tw-leading{syntax:"*";inherits:false}@property --tw-font-weight{syntax:"*";inherits:false}@property --tw-outline-style{syntax:"*";inherits:false;initial-value:solid}`;
//#endregion

const CSS =
  env.NODE_ENV === "development"
    ? readFileSync(".\\src\\template\\timetable.css")
    : STATIC_CSS;

const HTML_HEAD = `\
<!DOCTYPE html>
<html>
<head>
<!--<link rel="stylesheet" href="./timetable.css">-->
<meta charset="UTF-8">
</head>
<body class="bg-black flex flex-col gap-2 w-full items-stretch p-2">
<style>${CSS}</style>`; // eslint-disable-line

const HTML_SIZER = `<style>body{width:{width};height:{height};}</style>\n`;

const HTML_HEADER_WEEK = `\
<header class="{headerStyle} items-center flex flex-col p-1">
<a class="">{name}, {weekNumber} неделя</a>
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
<main class="grid {mainStyle} grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr] grid-rows-auto">
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
{start}<hr class="my-1">{end}
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
      mainStyle: stylemap.general.mainStyle,
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
    const column: string[] = Array(8) as string[];
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
  const startTime = process.hrtime.bigint();
  const html = await generateTimetableImageHtml(timetable, opts);
  const htmlTime = process.hrtime.bigint();
  const image = (await nodeHtmlToImage({
    html,
    puppeteerArgs: {
      executablePath: env.CHROME_PATH,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-software-rasterizer",
      ],
    },
  })) as Buffer;
  const endTime = process.hrtime.bigint();
  log.debug(
    `Generated an image for week [F:${timetable.isCommon} I:${timetable.withIet}] ${opts?.stylemap ?? "default"}/${timetable.groupId}/${timetable.week}. Took ${formatBigInt(htmlTime - startTime)}ns + ${formatBigInt(endTime - htmlTime)}ns`,
    { user: timetable.user },
  );
  return image;
}
