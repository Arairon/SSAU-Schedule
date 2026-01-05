import type { CustomizationData, LessonDateTime, ScheduleLessonType } from "@/lib/types";
import { applyCustomization, getLessonCustomization } from "@/lib/utils";
import { useState } from "react";
import { lessonStyles } from "./ScheduleViewer";
import type { LessonType } from "@shared/themes/types";

function EditableLesson({ base, time, customizationData, setData }: { base: Omit<ScheduleLessonType, "alts"> | null, time: LessonDateTime, customizationData: Partial<CustomizationData>, setData: () => void }) {
  const defaultBase: Omit<ScheduleLessonType, "alts"> = {
    id: -1,
    infoId: -1,
    discipline: "[Пара]",
    type: "Unknown",
    teacher: {
      name: "???",
      id: null
    },
    beginTime: new Date(0),
    endTime: new Date(0),
    customized: null,
    dayTimeSlot: time.timeSlot,
    original: null,
    building: null,
    room: null,
    conferenceUrl: null,
    isIet: false,
    isOnline: false,
    subgroup: null,
  }
  const lesson = applyCustomization(base || defaultBase, customizationData)

  let customized: "added" | "removed" | "modified" | null = null;
  if (lesson.customized) {
    if (lesson.original?.id) {
      if (lesson.customized.hidden) {
        customized = "removed"
      } else {
        customized = "modified"
      }
    } else {
      customized = "added"
    }
  }

  function customizationIndicator(type: typeof customized) {
    if (!type) return <>ERR</>
    switch (type) {
      case "added": return <span>+</span>
      case "removed": return <span>-</span>
      case "modified": return <span>*</span>
    }
  }
  const s = lessonStyles[lesson.type as LessonType] ?? lessonStyles.Unknown;
  return (
    <div key={lesson.id} className={"flex-1 " + s.cardStyle + (customized === "removed" ? " grayscale-50 opacity-50" : "")}>
      <div className={"rounded-xl p-1 " + s.barStyle}></div>
      <div className="px-1 text-left">
        <p className="flex flex-row">
          <a className={"flex-1 " + s.nameStyle}>{lesson.discipline}</a>
          {customized && customizationIndicator(customized)}
        </p>
        <hr className="my-1 border-white" />
        <p className={"text-sm " + s.teacherStyle}>{lesson.teacher.name}</p>
        <p className="flex w-full flex-row items-center">
          <a className={"flex-1 grow " + s.placeStyle}>{lesson.isOnline ? "Online" : `${lesson.building} - ${lesson.room}`}</a>
          {lesson.subgroup &&
            <a className={s.subgroupStyle}>Подгруппа: {lesson.subgroup}</a>}
          {lesson.isIet &&
            <a className={s.ietStyle}>ИОТ</a>}
        </p>
      </div>
    </div>
  )
}

export default function ScheduleLessonEditor({ lesson = null, time }: { lesson?: Omit<ScheduleLessonType, "alts"> | null, time: LessonDateTime }) {
  // TODO: Move to EditorState
  const [data, setData] = useState({} as Partial<CustomizationData>)

  return (
    <div className="flex flex-col items-stretch">
      <EditableLesson base={lesson} time={time} customizationData={data} setData={setData as (()=>void)} />
      <div>
        {lesson && JSON.stringify(getLessonCustomization(lesson), undefined, 2)}
      </div>
      {JSON.stringify(time)}
    </div>
  )
}
