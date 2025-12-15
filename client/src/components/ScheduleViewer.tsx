import { TimeSlotMap, type ScheduleLessonType, type ScheduleType } from "@/lib/types";
import { type StyleMap } from "@shared/themes/types";
import { SCHEDULE_STYLEMAP_DEFAULT } from "@shared/themes/default";
import { SCHEDULE_STYLEMAP_NEON } from "@shared/themes/neon";
import { SCHEDULE_STYLEMAP_DARK } from "@shared/themes/dark";


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
  console.log(style.name)

  const columnHeight = schedule.days.reduce((a, day) => {
    const t = day.lessons.reduce((b, lesson) => b > lesson.dayTimeSlot ? b : lesson.dayTimeSlot, 0)
    return a > t ? a : t
  }, 0)
  console.log(columnHeight)
  return (
    <div className="flex w-full flex-col items-stretch gap-2 bg-black p-2 text-base">
    <nav className="flex flex-row justify-between gap-2 text-center font-bold">
    {Object.values(style.lessonTypes).map(lessonType=>(
      <div key={lessonType.name} className={"flex-1 p-1 " + lessonType.headerStyle}>{lessonType.name}</div>
    ))}
    </nav>
    <div className="grid grid-flow-col grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr] gap-1" style={{ gridTemplateRows: `repeat(${columnHeight + 1}, auto)` }}>
      <div className={"flex flex-col justify-center rounded-lg p-2 font-bold " + style.general.headers.timeLabel}>
        Время
      </div>
      {
        TimeSlotMap.slice(1, columnHeight + 1).map(timeslot => (
          <div className={"flex flex-col justify-center rounded-lg p-2 font-bold " + style.general.headers.timeslot}>
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
            <div key={`${dayIndex}div`} className={"rounded-lg p-2 font-bold "+style.general.headers.weekday}>
              {WEEKDAYS[dayIndex + 1].short} {`${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}`}
            </div>
            {
              new Array(columnHeight).fill(0).map((_, index) => (
                <ScheduleLesson key={`${dayIndex}.${index}`} lesson={day.lessons.find(i => i.dayTimeSlot == index + 1) ?? null} stylemap={stylemap}/>
              ))
            }
          </>
        })
      }


    </div>
    </div>
  )
}


