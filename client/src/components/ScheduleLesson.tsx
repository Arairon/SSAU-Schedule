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
import { Dialog, DialogContent, DialogHeader, DialogTrigger, DialogTitle, DialogDescription, DialogClose, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { useIsMobile } from "@/hooks/useIsMobile";

export function ScheduleLessonWindow({ hasMenu = true, time = null }: { hasMenu?: boolean, time?: LessonDateTime|null }) {
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

  function openEditor() {
    console.log("Add New @", time)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={"flex flex-col items-center justify-center flex-1 group p-2 " + s.cardStyle}>
        <Button variant={"ghost"} className={"border-dashed transition-opacity  " + (isMobile ? "opacity-20" : "opacity-0 group-hover:opacity-20")} onClick={openEditor}><PlusIcon /> Добавить пару</Button>
      </div>
    </div>
  )
}

export function ScheduleLesson({ lesson, hasMenu = true }: { lesson: ScheduleLessonType | null; hasMenu?: boolean }) {
  const style = lessonStyles;

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

  function toggleLessonHidden() {
    console.log("toggleLessonHidden", lesson)
  }

  function openEditor() {
    console.log("Edit", lesson)
  }

  function resetCustomization() {
    console.log("Reset", lesson)
  }

  const s = style[lesson.type as LessonType] ?? style.Unknown;
  if (!hasMenu)
    return (
      <div className="flex flex-col gap-1">
        {[lesson, ...lesson.alts].map((lesson) =>
          <div key={lesson.id} className={"flex-1 " + s.cardStyle + (customized === "removed" ? " grayscale-50 opacity-50" : "")}>
            <div className={"rounded-xl p-1 " + s.barStyle}></div>
            <div className="px-1 text-left">
              <p className="flex flex-row">
                <a className={"flex-1 " + s.nameStyle}>{lesson.discipline}</a>
                {customized && customizationIndicator(customized)}
              </p>
              <hr className="my-1 border-white" />
              <p className={s.teacherStyle}>{lesson.teacher}</p>
              <p className="flex w-full flex-row items-center">
                <a className={"flex-1 grow " + s.placeStyle}>{lesson.isOnline ? "Online" : `${lesson.building} - ${lesson.room}`}</a>
                {lesson.subgroup &&
                  <a className={s.subgroupStyle}>Подгруппа: {lesson.subgroup}</a>}
                {lesson.isIet &&
                  <a className={s.ietStyle}>ИОТ</a>}
              </p>
            </div>
          </div>
        )}
      </div>
    )
  return (

    <Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className={"flex flex-col gap-1 " + (hasMenu ? "cursor-pointer" : "")}>
            {[lesson, ...lesson.alts].map((lesson) =>
              <div key={lesson.id} className={"flex-1 " + s.cardStyle + (lesson.customized?.hidden ? " grayscale-50 opacity-50" : "")}>
                <div className={"rounded-xl p-1 " + s.barStyle}></div>
                <div className="px-1 text-left">
                  <p className="flex flex-row">
                    <a className={"flex-1 " + s.nameStyle}>{lesson.discipline}</a>
                    {customized && customizationIndicator(customized)}
                  </p>
                  <hr className="my-1 border-white" />
                  <p className={s.teacherStyle}>{lesson.teacher}</p>
                  <p className="flex w-full flex-row items-center">
                    <a className={"flex-1 grow " + s.placeStyle}>{lesson.isOnline ? "Online" : `${lesson.building} - ${lesson.room}`}</a>
                    {lesson.subgroup &&
                      <a className={s.subgroupStyle}>Подгруппа: {lesson.subgroup}</a>}
                    {lesson.isIet &&
                      <a className={s.ietStyle}>ИОТ</a>}
                  </p>
                </div>
              </div>
            )}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={toggleLessonHidden}>
            {lesson.customized?.hidden ? <><BellOffIcon /> Восстановить</> : <><BellIcon /> Игнорировать</>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openEditor}>
            <PenIcon /> Редактировать
          </DropdownMenuItem>
          {customized &&
            <DropdownMenuItem className="focus:bg-destructive/50 focus:text-destructive-foreground">
              <DialogTrigger asChild>
                <div className="flex flex-row items-center gap-2"><TrashIcon /> {lesson.original?.id ? "Сбросить" : "Удалить"}</div>
              </DialogTrigger>
            </DropdownMenuItem>
          }
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сброс кастомной пары</DialogTitle>
          <DialogDescription>
            Данное действие отменит все изменения, примянённые к этой паре<br />
            Отменить его будет невозможно
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Отмена</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant={"destructive"} onClick={resetCustomization}>{lesson.original?.id ? "Сбросить" : "Удалить"}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

