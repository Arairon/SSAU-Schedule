import { TimeSlotMap, type ScheduleLessonType, type ScheduleType } from "@/lib/types";
import { useEffect, useState, } from "react";
import { getWeekFromDate } from "@shared/date";
import type { LessonType } from "@shared/themes/types";

type LessonTypeStyle = Record<string, string>

const lessonStyles: Record<LessonType, LessonTypeStyle> = {
  Lection: {
    name: "Лекция",
    headerStyle:
      "border-2 border-green-400 bg-green-950 text-white rounded-lg text-lg",
    barStyle: "hidden",
    cardStyle:
      "border-2 border-green-400 bg-green-950 text-white rounded-lg px-1 py-2",
    nameStyle: "font-bold", //capitalize
    teacherStyle: "",
    placeStyle: "font-bold",
    subgroupStyle: "font-bold",
    groupListStyle:
      "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    ietStyle:
      "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
    ietLabel: "ИОТ",
  },
  Practice: {
    name: "Практика",
    headerStyle:
      "border-2 border-red-400 bg-red-950 text-white rounded-lg text-lg",
    barStyle: "hidden text-lg",
    cardStyle:
      "border-2 border-red-400 bg-red-950 text-white rounded-lg px-1 py-2",
    nameStyle: "font-bold", //capitalize
    teacherStyle: "",
    placeStyle: "font-bold",
    subgroupStyle: "font-bold",
    groupListStyle:
      "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    ietStyle:
      "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
    ietLabel: "ИОТ",
  },
  Lab: {
    name: "Лабораторная",
    headerStyle:
      "border-2 border-purple-400 bg-purple-950 text-white rounded-lg text-lg",
    barStyle: "hidden",
    cardStyle:
      "border-2 border-purple-400 bg-purple-950 text-white rounded-lg px-1 py-2",
    nameStyle: "font-bold", //capitalize
    teacherStyle: "",
    placeStyle: "font-bold",
    subgroupStyle: "font-bold",
    groupListStyle:
      "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    ietStyle:
      "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
    ietLabel: "ИОТ",
  },
  Other: {
    name: "Прочее",
    headerStyle:
      "border-2 border-yellow-400 bg-yellow-950 text-white rounded-lg text-lg",
    barStyle: "hidden",
    cardStyle:
      "border-2 border-yellow-400 bg-yellow-950 text-white rounded-lg px-1 py-2",
    nameStyle: "font-bold", //capitalize
    teacherStyle: "",
    placeStyle: "font-bold",
    subgroupStyle: "font-bold",
    groupListStyle:
      "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    ietStyle:
      "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
    ietLabel: "ИОТ",
  },
  Consult: {
    name: "Консультация",
    headerStyle:
      "border-2 border-blue-400 bg-blue-950 text-white rounded-lg text-lg",
    barStyle: "hidden text-lg",
    cardStyle:
      "border-2 border-blue-400 bg-blue-950 text-white rounded-lg px-1 py-2",
    nameStyle: "font-bold", //capitalize
    teacherStyle: "",
    placeStyle: "font-bold",
    subgroupStyle: "font-bold",
    groupListStyle:
      "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    ietStyle:
      "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
    ietLabel: "ИОТ",
  },
  Exam: {
    name: "Экзамен",
    headerStyle:
      "border-2 border-white bg-black text-white rounded-lg text-lg",
    barStyle: "hidden text-lg",
    cardStyle:
      "border-2 border-white bg-black text-white rounded-lg px-1 py-2",
    nameStyle: "font-bold", //capitalize
    teacherStyle: "",
    placeStyle: "font-bold",
    subgroupStyle: "font-bold",
    groupListStyle:
      "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    ietStyle:
      "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
    ietLabel: "ИОТ",
  },
  Military: {
    name: "Военка",
    headerStyle:
      "border-2 border-yellow-400 bg-yellow-950 text-white rounded-lg text-lg hidden",
    barStyle: "hidden",
    cardStyle:
      "border-2 border-yellow-400 bg-yellow-950 text-white rounded-lg px-1 py-2",
    nameStyle: "font-bold", //capitalize
    teacherStyle: "",
    placeStyle: "font-bold",
    subgroupStyle: "font-bold",
    groupListStyle:
      "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    ietStyle:
      "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
    ietLabel: "ИОТ",
  },
  Window: {
    name: "Окно",
    headerStyle: "bg-white rounded-lg hidden",
    barStyle: "hidden text-lg",
    cardStyle:
      "border-2 border-slate-600 bg-slate-900 text-white rounded-lg px-1 py-2",
    nameStyle: "hidden",
    teacherStyle: "",
    placeStyle: "font-bold",
    subgroupStyle: "font-bold",
    groupListStyle:
      "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    ietStyle:
      "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
    ietLabel: "ИОТ",
  },
  Unknown: {
    name: "Неизвестно",
    headerStyle:
      "bg-white rounded-lg outline-purple-500 outline-2 outline-dashed hidden text-lg",
    barStyle: "hidden bg-black",
    cardStyle:
      "border-2 border-slate-500 bg-slate-800 text-white rounded-lg px-1 py-2",
    nameStyle: "font-bold", //capitalize
    teacherStyle: "",
    placeStyle: "font-bold",
    subgroupStyle: "font-bold",
    groupListStyle:
      "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    ietStyle:
      "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
    ietLabel: "ИОТ",
  },
}

export function ScheduleLesson({ lesson, }: { lesson: ScheduleLessonType | null, }) {
  const style = lessonStyles;

  if (!lesson) {
    const s = style.Window;
    return (
      <div className="flex flex-col gap-1">
        <div className={"flex-1 " + s.cardStyle}>
          <div className={"rounded-xl p-1 " + s.barStyle}></div>
          <div className="px-1 text-left">
            <p className={s.nameStyle}>{s.name}</p>
          </div>
        </div>
      </div>
    )
  }

  const s = style[lesson.type as LessonType] ?? style.Unknown
  return (
    <div className="flex flex-col gap-1">
      {[lesson, ...lesson.alts].map((lesson, index) =>
        <div key={index} className={"flex-1 " + s.cardStyle}>
          <div className={"rounded-xl p-1 " + s.barStyle}></div>
          <div className="px-1 text-left">
            <p className={s.nameStyle}>{lesson.discipline}</p>
            <hr className="my-1 border-white" />
            <p className={s.teacherStyle}>{lesson.teacher}</p>
            <p className="flex w-full flex-row items-center">
              <a className={"flex-1 grow " + s.placeStyle}>{lesson.isOnline ? "Online" : `${lesson.building} - ${lesson.room}`}</a>
              {lesson.subgroup &&
                <a className={s.subgroupStyle}>Подгруппа: {lesson.subgroup}</a>
              }
              {lesson.isIet &&
                <a className={s.ietStyle}>ИОТ</a>
              }
            </p>
          </div>
        </div>
      )}
    </div>
  )
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

export default function ScheduleViewer({ schedule }: { schedule: ScheduleType }) {
  const columnHeight = schedule.days.reduce((a, day) => {
    const t = day.lessons.reduce((b, lesson) => b > lesson.dayTimeSlot ? b : lesson.dayTimeSlot, 0)
    return a > t ? a : t
  }, 0)

  useEffect(() => {
    const today = new Date();
    let initialColumn = 0;
    if (getWeekFromDate(today) === schedule.week) {
      initialColumn = today.getDay() - 1;
      if (initialColumn === 5) initialColumn = 0; // Handle sunday
    } else {
      initialColumn = schedule.days.findIndex(i => i.lessonCount > 0)
      if (initialColumn < 0) initialColumn = 0;
    }
    setCurrentDay(initialColumn)
  }, [schedule])

  const [currentDay, setCurrentDay] = useState(0);

  const isMobile = window.innerWidth <= 640;



  const boldnessLevels = [
    'font-thin',
    'font-extralight',
    // 'font-light',
    'font-normal',
    // 'font-medium',
    // 'font-semibold',
    'font-bold',
    'font-extrabold',
  ]

  function getBoldness(count: number) {
    let level = Math.min(count, boldnessLevels.length - 1);
    return " " + boldnessLevels[level]

  }

  function dayHeader(day: typeof schedule.days[number], dayIndex: number) {
    const date = day.beginTime
    return <div key={`${dayIndex}div${date}`} className="snap-end rounded-lg border-2 border-cyan-600 bg-cyan-900 p-2 font-bold text-white sm:min-w-0">
      {WEEKDAYS[dayIndex + 1].short} {`${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}`}
    </div>

  }

  function renderDay(day: typeof schedule.days[number], dayIndex: number) {
    return <>
      {dayHeader(day, dayIndex)}
      {
        new Array(columnHeight).fill(0).map((_, index) => (
          <ScheduleLesson key={`lesson_${dayIndex}.${index}`} lesson={day.lessons.find(i => i.dayTimeSlot == index + 1) ?? null} />
        ))
      }
    </>
  }


  function daySelector() {
    return <nav className="flex flex-row items-stretch justify-center gap-2">
      {
        schedule.days.map((day, dayIndex) => {
          return <>
            <button onClick={() => setCurrentDay(dayIndex)} key={`${dayIndex}navdiv`}
              className={"flex-1 rounded-lg py-1 px-2 font-bold border-2 border-cyan-600 bg-cyan-900 text-white" +
                (dayIndex === currentDay ? " border-yellow-50" : "") +
                getBoldness(day.lessonCount) +
                (day.lessonCount === 0 ? " line-through" : "")
              }>
              {WEEKDAYS[dayIndex + 1].short}
            </button>
          </>
        })
      }
    </nav>
  }

  function timeSlots() {
    if (columnHeight === 0) {
      // Пар нет
      return (
        <div
          className={"sticky left-0 flex flex-col justify-center rounded-lg p-2 font-bold min-w-16 sm:min-w-0 border-2 border-cyan-600 bg-cyan-900 text-white"}>
          {TimeSlotMap[0].beginTime}
          <hr className="my-1 border-white" />
          {TimeSlotMap.at(-1)!.endTime}
        </div>
      )
    }

    return <>
      {
        TimeSlotMap.slice(1, columnHeight + 1).map((timeslot) => (
          <div key={`timeslot${timeslot.name}`}
            className={"sticky left-0 flex flex-col justify-center rounded-lg p-2 font-bold min-w-16 sm:min-w-0 border-2 border-cyan-600 bg-cyan-900 text-white"}>
            {timeslot.beginTime}
            <hr className="my-1 border-white" />
            {timeslot.endTime}
          </div>
        ))
      }
    </>
  }

  function timetable() {
    if (columnHeight === 0) {
      // Пар нет
      const s = lessonStyles.Window
      if (isMobile) {
        const start = schedule.days[0].beginTime
        const end = schedule.days[5].beginTime
        return <>
          <div className="min-w-80 snap-end rounded-lg border-2 border-cyan-600 bg-cyan-900 p-2 font-bold text-white sm:min-w-0">
            {`${start.getDate().toString().padStart(2, "0")}.${(start.getMonth() + 1).toString().padStart(2, "0")}`}
            &nbsp;-&nbsp;
            {`${end.getDate().toString().padStart(2, "0")}.${(end.getMonth() + 1).toString().padStart(2, "0")}`}
          </div>

          <div className="flex flex-col gap-1">
            <div className={"flex-1 py-20 " + s.cardStyle}>
              <div className={"rounded-xl p-1 " + s.barStyle}></div>
              <div className="flex h-full flex-col justify-center px-1 text-left">
                <p className="block text-center text-4xl font-bold">Пар нет :D</p>
              </div>
            </div>
          </div>
        </>
      }
      return <>
        {dayHeader(schedule.days[0], 0)}
        <div className="col-span-6 flex flex-col gap-1">
          <div className={"flex-1 py-20 " + s.cardStyle}>
            <div className={"rounded-xl p-1 " + s.barStyle}></div>
            <div className="flex h-full flex-col justify-center px-1 text-left">
              <p className="block text-center text-4xl font-bold">Пар нет :D</p>
            </div>
          </div>
        </div>
        {schedule.days.slice(1).map((day, index) => dayHeader(day, index + 1))}
      </>
    }
    if (isMobile) return renderDay(schedule.days[currentDay], currentDay) // Рендерим всего один день
    return <>{schedule.days.map(renderDay)}</>

  }


  return (
    <div className="relative flex w-full flex-col items-stretch gap-2 p-2 text-base">
      {/*
      <nav className="flex flex-row justify-between gap-2 overflow-x-auto text-center font-bold">
         {Object.values(style.lessonTypes).map(lessonType => (
           <div key={lessonType.name} className={"flex-1 p-1 " + lessonType.headerStyle}>{lessonType.name}</div>
         ))} 
      </nav>
      */}
      {isMobile && daySelector()}
      <div className={"grid snap-x snap-proximity grid-flow-col  gap-1 overflow-x-auto scroll-smooth " +
        (!isMobile ? "grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr]" : "grid-cols-[auto_1fr]")}
        style={{ gridTemplateRows: `repeat(${(columnHeight || 1) + 1}, auto)` }}>
        <div className={"sticky left-0 snap-start flex flex-col justify-center rounded-lg p-2 font-bold border-2 border-cyan-600 bg-cyan-900 text-white"}>
          Время
        </div>
        {timeSlots()}
        {timetable()}
      </div>
    </div >
  )
}


