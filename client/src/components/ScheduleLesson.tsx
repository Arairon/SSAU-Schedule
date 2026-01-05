import type { ScheduleLessonType, LessonDateTime } from "@/lib/types";
import type { LessonType } from "@shared/themes/types";
import { lessonStyles } from "./ScheduleViewer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BellIcon, BellOffIcon, PenIcon, PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "./ui/button";
import { useIsMobile } from "@/hooks/useIsMobile";
import useEditorState from "@/hooks/useEditorState";
import { getWeekFromDate } from "@shared/date";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addCustomLesson, editCustomLesson } from "@/api/api";
import { useTg } from "@/hooks/useTg";
import { getLessonCustomization } from "@/lib/utils";
import { toast } from "sonner";

export function ScheduleLessonWindow({ hasMenu = true, time = null }: { hasMenu?: boolean, time?: LessonDateTime | null }) {
  const { openEditDialog } = useEditorState();
  const s = lessonStyles.Window;

  const isMobile = useIsMobile()

  if (!hasMenu || !time)
    return (
      <div className="flex flex-col gap-1">
        <div className={"flex-1 " + s.cardStyle}>
          <div className={"rounded-xl p-1 " + s.barStyle}></div>
          <div className="px-1 text-left">
            <p className={s.nameStyle}>{s.name}</p>
          </div>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-1">
      <div className={"flex flex-col items-center justify-center flex-1 group p-2 " + s.cardStyle}>
        <Button variant={"ghost"} className={"border-dashed transition-opacity  " + (isMobile ? "opacity-20" : "opacity-0 group-hover:opacity-20")}
          onClick={() => { openEditDialog({ lesson: null, time }) }}><PlusIcon /> Добавить пару</Button>
      </div>
    </div>
  )
}

export function ScheduleLesson({ lesson, hasMenu = true }: { lesson: ScheduleLessonType | null; hasMenu?: boolean }) {
  if (!lesson) return <ScheduleLessonWindow hasMenu={false} />
  return (
    <div className="flex flex-col gap-1">
      {[lesson, ...lesson.alts].map((lesson) =>
        hasMenu ?
          <ScheduleSingleLessonInteractive key={lesson.id} lesson={lesson} />
          :
          <ScheduleSingleLesson lesson={lesson} />
      )}
    </div>)

}

export function ScheduleSingleLesson({ lesson }: { lesson: Omit<ScheduleLessonType, "alts"> | null }) {
  if (!lesson) return <ScheduleLessonWindow hasMenu={false} />
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
  const style = lessonStyles;
  const s = style[lesson.type as LessonType] ?? style.Unknown;
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


export function ScheduleSingleLessonInteractive({ lesson, hasMenu = true }: { lesson: Omit<ScheduleLessonType, "alts"> | null; hasMenu?: boolean }) {
  const { openEditDialog, openDeleteDialog } = useEditorState()
  const { raw: rawTgInfo } = useTg()
  const queryClient = useQueryClient()
  const toggleHidden = useMutation({
    mutationKey: [lesson?.id, lesson?.customized?.hidden],
    mutationFn: () => {
      if (!rawTgInfo) throw new Error("Unable to edit outside of telegram")
      if (!lesson) throw new Error("Attempt to modify a null lesson")

      const customizationData = getLessonCustomization(lesson)
      customizationData.hideLesson = !customizationData.hideLesson;
      if (lesson.original || !lesson.customized) customizationData.lessonId = lesson.original?.id || lesson.id

      let promise: Promise<any>;
      if (lesson?.customized) {
        promise = editCustomLesson({ rawTgInfo, customizationData })
      } else {
        promise = addCustomLesson({ rawTgInfo, customizationData })
      }
      toast.promise(promise, { loading: "Обновляем...", error: "Произошла ошибка", success: "Пара обновлена" })
      return promise
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] })
    }
  })

  if (!lesson) return <ScheduleLessonWindow hasMenu={false} />

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

  const style = lessonStyles;
  const s = style[lesson.type as LessonType] ?? style.Unknown;
  if (!hasMenu)
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

  function toggleLessonHidden() {
    toggleHidden.mutate()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div key={lesson.id} className={"flex-1 " + s.cardStyle + (lesson.customized?.hidden ? " grayscale-50 opacity-50" : "") + (hasMenu ? " cursor-pointer" : "")}>
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
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuItem onClick={toggleLessonHidden}>
          {lesson.customized?.hidden ? <><BellOffIcon /> Восстановить</> : <><BellIcon /> Игнорировать</>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openEditDialog({ lesson, time: { week: getWeekFromDate(lesson.beginTime), weekday: lesson.beginTime.getDay(), timeSlot: lesson.dayTimeSlot } })}>
          <PenIcon /> Редактировать
        </DropdownMenuItem>
        {customized &&
          <DropdownMenuItem className="focus:bg-destructive/50 focus:text-destructive-foreground" onClick={() => openDeleteDialog({ lesson })}>
            <div className="flex flex-row items-center gap-2"><TrashIcon /> {lesson.original?.id ? "Сбросить" : "Удалить"}</div>
          </DropdownMenuItem>
        }
      </DropdownMenuContent>
    </DropdownMenu>


  )
}
