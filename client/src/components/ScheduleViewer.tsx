import { useEffect, useState, } from "react";
import { getWeekFromDate, isSameDay } from "@shared/date";
import { SCHEDULE_STYLEMAP_NEON } from "@shared/themes/neon"
import { ScheduleLesson, ScheduleLessonWindow } from "./ScheduleLesson";
import type { ScheduleType } from "@/lib/types";
import { TimeSlotMap } from "@/lib/types";
import { useIsMobile } from "@/hooks/useIsMobile";

export const lessonStyles = SCHEDULE_STYLEMAP_NEON.lessonTypes

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

export default function ScheduleViewer({ schedule, editingEnabled = false }: { schedule: ScheduleType; editingEnabled?: boolean }) {
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
    }
    if (initialColumn < 0) initialColumn = 0;
    setCurrentDay(initialColumn)
  }, [schedule.week])

  const [currentDay, setCurrentDay] = useState(0);

  const isMobile = useIsMobile();



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
    const level = Math.min(count, boldnessLevels.length - 1);
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
        new Array(columnHeight).fill(0).map((_, index) => {
          const lesson = day.lessons.find(i => i.dayTimeSlot == index + 1) ?? null
          if (!lesson) return <ScheduleLessonWindow key={`lesson_${dayIndex}.${index}`} time={{ week: day.week, weekday: day.weekday, timeSlot: index + 1 }} hasMenu={editingEnabled} />
          return <ScheduleLesson key={`lesson_${dayIndex}.${index}`} lesson={lesson} hasMenu={editingEnabled} />
        })
      }
    </>
  }


  function daySelector() {
    return <nav className="flex flex-row items-stretch justify-center gap-2">
      {
        schedule.days.map((day, dayIndex) => {
          let borderColor = "border-cyan-600"
          const isToday = isSameDay(day.beginTime, new Date());
          if (isToday) borderColor = "border-purple-200"
          if (dayIndex === currentDay) {
            borderColor = "border-green-200"
            if (isToday) borderColor = "border-yellow-300"
          }
          return <>
            <button onClick={() => setCurrentDay(dayIndex)} key={`${day.week}.${day.weekday}navdiv`}
              className={`flex-1 rounded-lg py-1 px-2 font-bold border-2 ${borderColor} bg-cyan-900 text-white` +
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
          key="timeSlotNoLessons"
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
          <div key={`timeslot-${timeslot.name}`}
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
          <div key="dayLabelNoLessons" className="min-w-80 snap-end rounded-lg border-2 border-cyan-600 bg-cyan-900 p-2 font-bold text-white sm:min-w-0">
            {`${start.getDate().toString().padStart(2, "0")}.${(start.getMonth() + 1).toString().padStart(2, "0")}`}
            &nbsp;-&nbsp;
            {`${end.getDate().toString().padStart(2, "0")}.${(end.getMonth() + 1).toString().padStart(2, "0")}`}
          </div>

          <div key="noLessonsCard" className="flex flex-col gap-1">
            <div className={"flex-1 py-20 " + s.cardStyle}>
              <div className={"rounded-xl p-1 " + s.barStyle}></div>
              <div className="flex h-full flex-col justify-center px-1 text-left">
                <p className="block text-center text-4xl font-bold">Пар нет :D</p>
              </div>
            </div>
          </div>
        </>
      }
      // Desktop version
      return <>
        {dayHeader(schedule.days[0], 0)}
        <div key="noLessonsCard" className="col-span-6 flex flex-col gap-1">
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
        <div key="timeLabel" className={"sticky left-0 snap-start flex flex-col justify-center rounded-lg p-2 font-bold border-2 border-cyan-600 bg-cyan-900 text-white"}>
          Время
        </div>
        {timeSlots()}
        {timetable()}
      </div>
    </div >
  )
}


