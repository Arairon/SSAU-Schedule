import { SelectTrigger, SelectValue } from "@radix-ui/react-select";
import { EyeIcon, EyeOffIcon, GlobeIcon } from "lucide-react";
import { toast } from "sonner";
import { getLessonDate, getWeekFromDate } from "@shared/date";
import { useState } from "react";
import { lessonStyles } from "./ScheduleViewer";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem } from "./ui/select";
import { Toggle } from "./ui/toggle";
import { Calendar } from "./ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import type { LessonType } from "@shared/themes/types";
import type { CustomizationData, LessonDateTime, ScheduleLessonType } from "@/lib/types";
import { TimeSlotMap } from "@/lib/types";
import { applyCustomization } from "@/lib/utils";
import useEditorState from "@/hooks/useEditorState";

function EditableLesson({ base, time, customizationData, setData }: { base: Omit<ScheduleLessonType, "alts"> | null, time: LessonDateTime, customizationData: Partial<CustomizationData>, setData: (data: Partial<CustomizationData>) => void }) {
  const defaultBase: Omit<ScheduleLessonType, "alts"> = {
    id: -1,
    infoId: -1,
    discipline: "",
    type: "Unknown",
    teacher: {
      name: "",
      id: null
    },
    beginTime: new Date(0),
    endTime: new Date(0),
    customized: null,
    dayTimeSlot: time.dayTimeSlot,
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

  function updateField<T extends keyof CustomizationData>(field: T, value: CustomizationData[T]) {
    setData({
      ...customizationData,
      [field]: value
    });
  }

  const s = lessonStyles[lesson.type as LessonType] ?? lessonStyles.Unknown;
  return (
    <div key={lesson.id} className={"flex-1 " + s.cardStyle + (customized === "removed" ? " grayscale-50" : "")}>
      <div className={"rounded-xl p-1 " + s.barStyle}></div>
      <div className="flex flex-col gap-2 px-1 text-left">
        <div className="flex flex-row gap-2">
          <Input className={"border-2 border-foreground/20 p-1  flex-1 md:text-lg " + s.nameStyle}
            placeholder={"Название пары"} value={lesson.discipline} onChange={e =>
              updateField("discipline", e.currentTarget.value)
            } />
          {customized && customizationIndicator(customized)}
        </div>
        <hr className="my-1 border-white" />
        <Input className={"border-2 border-foreground/20 p-1  flex-1 md:text-base  " + s.teacherStyle}
          placeholder={"Преподаватель"} value={lesson.teacher.name} onChange={_ =>
            toast.warning("Редактирование преподавателей пока не доступно")
          } onClick={() => toast.warning("Редактирование преподавателей пока не доступно", { duration: 1000 })} readOnly />
        <div className="flex w-full flex-row items-center gap-2">
          <div className={"flex-1 grow flex flex-row items-center justify-between gap-2 max-w-50 " + s.placeStyle}>
            {
              lesson.isOnline ? (
                <div className="flex-1 rounded-lg border-2 border-foreground/20 p-1 text-center text-base">Online</div>
              ) : <>
                <Input className="flex-2 border-2 border-foreground/20 p-1 md:text-base"
                  value={lesson.building ?? ""} placeholder="Корпус" onChange={e =>
                    updateField("building", e.currentTarget.value || null)
                  } />
                -
                <Input className="flex-3 border-2 border-foreground/20 p-1 md:text-base"
                  value={lesson.room ?? ""} placeholder="Аудитория" onChange={e =>
                    updateField("room", e.currentTarget.value || null)
                  } />
              </>
            }
          </div>
          <Toggle pressed={lesson.isOnline} className="border-2" onPressedChange={value => updateField("isOnline", value)}>
            <GlobeIcon />
          </Toggle>
          <Select value={String(lesson.subgroup)} onValueChange={value => updateField("subgroup", value === "null" ? null : parseInt(value))}>
            <SelectTrigger className="flex-1 rounded-lg border-2 border-foreground/20 p-1">
              <a>Подгруппа: </a>
              <SelectValue placeholder="?" />
            </SelectTrigger>
            <SelectContent>
              {/* TODO: Allow overriding subroup to be both */}
              {!(base?.subgroup) &&
                <SelectItem value="null">Обе</SelectItem>
              }
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input className="flex-1 border-2 border-foreground/20 p-1 md:text-base"
          placeholder="Ссылка" value={lesson.conferenceUrl ?? ""} onChange={e =>
            updateField("conferenceUrl", e.currentTarget.value || null)
          } />
        <div className="flex flex-row gap-2">
          <Select value={lesson.type} onValueChange={value => updateField("type", value)}>
            <SelectTrigger className="flex-1 rounded-lg border-2 border-foreground/20 p-1">
              <SelectValue placeholder="?" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(lessonStyles).map(([type, data]) =>
                <SelectItem key={type} value={type}>{data.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Toggle className="border-2" pressed={lesson.isIet} onPressedChange={value => updateField("isIet", value)}>
            <a>ИОТ</a>
          </Toggle>
          <Toggle className="border-2" pressed={!!lesson.customized?.hidden} onPressedChange={value => updateField("hideLesson", value)}>
            {lesson.customized?.hidden ? <EyeOffIcon /> : <EyeIcon />}
          </Toggle>
        </div>
      </div>
    </div>
  )
}

export default function ScheduleLessonEditor({ lesson = null, time }: { lesson?: Omit<ScheduleLessonType, "alts"> | null, time: LessonDateTime }) {
  // TODO: Move to EditorState
  const { customizationData, setCustomizationData } = useEditorState();
  const [isDateSelectorOpen, setDateSelectorOpen] = useState(false)

  function updateField<T extends keyof CustomizationData>(field: T, value: CustomizationData[T]) {
    setCustomizationData({
      ...customizationData,
      [field]: value
    });
  }

  function onCalendarSelect(date: Date) {
    if (date.getDay() === 0) {
      toast.warning("Пар в воскресенье не бывает.")
      return;
    }
    customizationData.weekday = date.getDay()
    updateField("weekNumber", getWeekFromDate(date))

  }

  const lessonDate = getLessonDate(customizationData.weekNumber || time.weekNumber, customizationData.weekday || time.weekday)

  const minDate = getLessonDate(1, 1);
  const maxDate = getLessonDate(52, 6)

  return (
    <div className="flex flex-col items-stretch gap-2">
      <EditableLesson base={lesson} time={time} customizationData={customizationData} setData={setCustomizationData} />
      <div>
        <Collapsible className="flex flex-col items-stretch justify-stretch rounded-lg border-2 p-1" open={isDateSelectorOpen}>
          <CollapsibleTrigger className="flex flex-col" asChild>
            <Toggle className="flex-1 p-1 hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent" pressed={isDateSelectorOpen} onPressedChange={setDateSelectorOpen}>
              Выбор даты / времени
            </Toggle>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-row items-stretch justify-evenly gap-1 sm:gap-2">
            <div className="flex flex-col items-center gap-1 py-2">
              {TimeSlotMap.slice(1).map((timeslot, index) => {
                const isCurrentTimeslot = (customizationData.dayTimeSlot || time.dayTimeSlot) === index + 1
                return <Toggle className="p-1 sm:px-2" key={timeslot.name} pressed={isCurrentTimeslot} onPressedChange={() => updateField("dayTimeSlot", index + 1)}>{timeslot.name}</Toggle>
              })}

            </div>
            <Calendar className="p-1 py-3 sm:p-3"
              mode="single"
              startMonth={minDate}
              endMonth={maxDate}
              weekStartsOn={1}
              showWeekNumber={false}
              showOutsideDays={false}
              fixedWeeks={true}
              selected={lessonDate}
              onSelect={date => date ? onCalendarSelect(date) : null} />
          </CollapsibleContent>
        </Collapsible>
      </div>
      <Input className="border-2 border-foreground/20 p-1 md:text-base"
        value={customizationData.comment ?? ""} onChange={e => updateField("comment", e.currentTarget.value)} placeholder="Комментарий к изменению" />
      {/*
      <div className="rounded-lg border-2 border-dashed p-1 text-sm">
        <p>CD: {JSON.stringify(customizationData, undefined, 2)}</p>
        <p>Cus(l): {lesson && JSON.stringify(getLessonCustomization(lesson), undefined, 2)}</p>
        <p>Cus(Appl(l, CD)): {lesson && JSON.stringify(getLessonCustomization(applyCustomization(lesson, customizationData)), undefined, 2)}</p>
        <p>Time: {JSON.stringify(time, undefined, 2)}</p>
      </div>
      */}
    </div>
  )
}
