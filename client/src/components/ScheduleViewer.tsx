import { TimeSlotMap, type ScheduleLessonType, type ScheduleType } from "@/lib/types";
import { type StyleMap } from "@shared/themes/types";
import { SCHEDULE_STYLEMAP_DEFAULT } from "@shared/themes/default";
import { SCHEDULE_STYLEMAP_NEON } from "@shared/themes/neon";
import { SCHEDULE_STYLEMAP_DARK } from "@shared/themes/dark";
import { useEffect, useRef, type Ref } from "react";


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

  const gridRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Array<HTMLDivElement>>([])

  const today = new Date();

  // This is a mess, but i haven't found a better solution to keep native scroll but prevent inertia
  useEffect(() => {
    const container = gridRef.current!;
    const columns = colRefs.current;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let currentCol = today.getDay() - 1;
    if (currentCol === 5) currentCol = 0; // Handle sunday
    columns[currentCol].scrollIntoView({ block: "nearest", inline: "end", behavior: "instant" })
    let targetCol = 0;
    const elementWidth = columns[0].clientWidth;
    const stepTreshold = elementWidth * 0.2;

    const handleTouchStart = (e: TouchEvent) => {
      isDragging = true;
      startX = e.touches[0].pageX - container.offsetLeft;
      startY = e.touches[0].pageY - container.offsetTop;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const x = e.touches[0].pageX - container.offsetLeft;
      const y = e.touches[0].pageY - container.offsetTop;
      const dx = startX - x;
      const dy = startY - y;
      console.log(dx, dy)
      if (Math.abs(dy) > 10) isDragging = false;
      if (dx > stepTreshold) {
        targetCol = 1;
      }
      else if (dx < -stepTreshold) {
        targetCol = -1
      }
      else {
        targetCol = 0;
      }
      // container.scrollLeft = startPos + walk;
    };

    const handleTouchEnd = () => {
      isDragging = false;
      if (!targetCol) return;
      currentCol += targetCol;
      if (currentCol < 0) currentCol = columns.length-1;
      if (currentCol >= columns.length) currentCol = 0;
      columns[currentCol].scrollIntoView({ block: "nearest", inline: "end" })
      console.log(columns[currentCol].offsetLeft - container.offsetLeft, (columns[currentCol].offsetLeft - container.offsetLeft) / elementWidth)
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => { };
  }, [])


  return (
    <div className="relative flex w-full flex-col items-stretch gap-2 bg-black p-2 text-base">
      {/* <nav className="flex flex-row justify-between gap-2 overflow-x-auto text-center font-bold"> */}
      {/*   {Object.values(style.lessonTypes).map(lessonType => ( */}
      {/*     <div key={lessonType.name} className={"flex-1 p-1 " + lessonType.headerStyle}>{lessonType.name}</div> */}
      {/*   ))} */}
      {/* </nav> */}
      <div
        className="pointer-events-none absolute top-2 bottom-2 left-2 z-0 w-18 rounded-lg rounded-l-none bg-black shadow-[1px_0_1px_1px_rgba(0,0,0,0.5)]"
        aria-hidden="true"
      />
      <div className="grid touch-pan-y snap-x snap-proximity grid-flow-col grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr] gap-1 overflow-x-auto scroll-smooth" style={{ gridTemplateRows: `repeat(${columnHeight + 1}, auto)` }} ref={gridRef}>
        <div className={"sticky left-0 snap-start flex flex-col justify-center rounded-lg p-2 font-bold " + style.general.headers.timeLabel}>
          Время
        </div>
        {
          TimeSlotMap.slice(1, columnHeight + 1).map((timeslot) => (
            <div key={`timeslot${timeslot.name}`} className={"sticky left-0 flex flex-col justify-center rounded-lg p-2 font-bold min-w-16 sm:min-w-0 " + style.general.headers.timeslot}>
              {timeslot.beginTime}
              <hr className="my-1" />
              {timeslot.endTime}
            </div>
          ))
        }
        {
          schedule.days.map((day, dayIndex) => {
            const date = day.beginTime
            return <>
              <div key={`${dayIndex}div`} ref={((el: HTMLDivElement) => colRefs.current[dayIndex] = el!) as unknown as Ref<HTMLDivElement>} className={"snap-end  min-w-80 sm:min-w-0 rounded-lg p-2 font-bold " + style.general.headers.weekday}>
                {WEEKDAYS[dayIndex + 1].short} {`${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}`}
              </div>
              {
                new Array(columnHeight).fill(0).map((_, index) => (
                  <ScheduleLesson key={`lesson_${dayIndex}.${index}`} lesson={day.lessons.find(i => i.dayTimeSlot == index + 1) ?? null} stylemap={stylemap} />
                ))
              }
            </>
          })
        }


      </div>
    </div>
  )
}


