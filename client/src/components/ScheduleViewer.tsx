import { TimeSlotMap, type ScheduleLessonType, type ScheduleType } from "@/lib/types";
import { type StyleMap } from "@shared/themes/types";
import { SCHEDULE_STYLEMAP_DEFAULT } from "@shared/themes/default";
import { SCHEDULE_STYLEMAP_NEON } from "@shared/themes/neon";
import { SCHEDULE_STYLEMAP_DARK } from "@shared/themes/dark";
import { useEffect, useRef, useState, type Ref } from "react";
import { getWeekFromDate } from "@shared/date";
import { Button } from "./ui/button";


export const STYLEMAPS: Record<string, StyleMap> = {
  default: SCHEDULE_STYLEMAP_DEFAULT,
  dark: SCHEDULE_STYLEMAP_DARK,
  neon: SCHEDULE_STYLEMAP_NEON,
};


export function ScheduleLesson({ lesson, stylemap = "default" }: { lesson: ScheduleLessonType | null, stylemap: string }) {
  const style = STYLEMAPS[stylemap] ?? SCHEDULE_STYLEMAP_DEFAULT
  if (!lesson) {
    const s = style.lessonTypes.Window;
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

  const s = style.lessonTypes[lesson.type]
  return (
    <div className="flex flex-col gap-1">
      {[lesson, ...lesson.alts].map((lesson, index) =>
        <div key={index} className={"flex-1 " + s.cardStyle}>
          <div className={"rounded-xl p-1 " + s.barStyle}></div>
          <div className="px-1 text-left">
            <p className={s.nameStyle}>{lesson.discipline}</p>
            <hr className="my-1" />
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

export default function ScheduleViewer({ schedule, stylemap = "default" }: { schedule: ScheduleType, stylemap: string }) {
  const style = STYLEMAPS[stylemap ?? "default"]

  const columnHeight = schedule.days.reduce((a, day) => {
    const t = day.lessons.reduce((b, lesson) => b > lesson.dayTimeSlot ? b : lesson.dayTimeSlot, 0)
    return a > t ? a : t
  }, 0)

  const today = new Date();
  let initialColumn = 0;
  if (getWeekFromDate(today) === schedule.week) {
    initialColumn = today.getDay() - 1;
    if (initialColumn === 5) initialColumn = 0; // Handle sunday
  }

  const [currentDay, setCurrentDay] = useState(initialColumn);

  const isMobile = window.innerWidth <= 640;

  function renderDay(day: typeof schedule.days[number], dayIndex: number) {
    const date = day.beginTime
    return <>
      <div key={`${dayIndex}div`} className={"snap-end  min-w-80 sm:min-w-0 rounded-lg p-2 font-bold " + style.general.headers.weekday}>
        {WEEKDAYS[dayIndex + 1].short} {`${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}`}
      </div>
      {
        new Array(columnHeight).fill(0).map((_, index) => (
          <ScheduleLesson key={`lesson_${dayIndex}.${index}`} lesson={day.lessons.find(i => i.dayTimeSlot == index + 1) ?? null} stylemap={stylemap} />
        ))
      }
    </>
  }


  return (
    <div className="relative flex w-full flex-col items-stretch gap-2 p-2 text-base">
      {/* <nav className="flex flex-row justify-between gap-2 overflow-x-auto text-center font-bold"> */}
      {/*   {Object.values(style.lessonTypes).map(lessonType => ( */}
      {/*     <div key={lessonType.name} className={"flex-1 p-1 " + lessonType.headerStyle}>{lessonType.name}</div> */}
      {/*   ))} */}
      {/* </nav> */}
      {isMobile &&
        <nav className="flex flex-row items-stretch justify-center gap-2">
          {
            schedule.days.map((_day, dayIndex) => {
              return <>
                <button onClick={() => setCurrentDay(dayIndex)} key={`${dayIndex}navdiv`}
                  className={"flex-1 rounded-lg py-1 px-2 font-bold " + (dayIndex === currentDay ? "border-yellow-50 " : "") + style.general.headers.weekday}>
                  {WEEKDAYS[dayIndex + 1].short}
                </button>
              </>
            })
          }
        </nav>
      }
      <div className="grid touch-pan-y snap-x snap-proximity grid-flow-col grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr] gap-1 overflow-x-auto scroll-smooth" style={{ gridTemplateRows: `repeat(${columnHeight + 1}, auto)` }}>
        <div className={"sticky left-0 snap-start flex flex-col justify-center rounded-lg p-2 font-bold " + style.general.headers.timeLabel}>
          Время
        </div>
        {
          TimeSlotMap.slice(1, columnHeight + 1).map((timeslot) => (
            <div key={`timeslot${timeslot.name}`} className={"sticky left-0 flex flex-col justify-center rounded-lg p-2 font-bold min-w-16 sm:min-w-0 " + style.general.headers.timeslot}>
              {timeslot.beginTime}
              <hr className="my-1 bg-white" />
              {timeslot.endTime}
            </div>
          ))
        }
        {/* Render a single day for mobile and the whole week for desktop */}
        { 
          isMobile ? renderDay(schedule.days[currentDay], currentDay) : schedule.days.map(renderDay)
        }


      </div>
    </div >
  )
}


