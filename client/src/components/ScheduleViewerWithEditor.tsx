import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ScheduleViewer from "./ScheduleViewer";

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import ScheduleLessonEditor from "./ScheduleLessonEditor";
import type { CustomizationData, ScheduleType } from "@/lib/types";
import useEditorState from "@/hooks/useEditorState";
import { addCustomLesson, deleteCustomLesson, editCustomLesson } from "@/api/api";



export default function ScheduleViewerWithEditor({ schedule }: { schedule: ScheduleType; }) {
  const { isDeleteDialogOpen, isEditDialogOpen, close, lesson, time: lessonTimeslot, customizationData } = useEditorState()
  const queryClient = useQueryClient()

  const resetCustomization = useMutation({
    mutationKey: ["customLesson", "reset"],
    mutationFn: () => {
      if (!lesson) throw new Error("Attempted to edit a null lesson")

      const promise = deleteCustomLesson({ id: lesson.id })
      toast.promise(promise, { loading: "Обновляем...", error: "Произошла ошибка", success: "Изменения сброшены" })
      return promise
    },
    onSuccess: (data: unknown) => {
      if (Array.isArray(data)) {
        const numbers = data.map(i => i?.weekNumber || 0)
        numbers.push(schedule.week)
        return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "schedule" && numbers.includes(q.queryKey[1]) })
      }
      const week = (data as any)?.weekNumber || 0
      if (week) {
        queryClient.invalidateQueries({ queryKey: ["schedule", week] })
        queryClient.invalidateQueries({ queryKey: ["schedule", schedule.week] })
      }
      else
        queryClient.invalidateQueries({ queryKey: ["schedule"] })
    }
  })

  const addCustomization = useMutation({
    mutationKey: ["customLesson", "add"],
    mutationFn: (data: Partial<CustomizationData>) => {
      const promise = addCustomLesson({ customizationData: data })
      toast.promise(promise, { loading: "Обновляем...", error: "Произошла ошибка", success: "Пара добавлена" })
      return promise
    },
    onSuccess: (data: unknown) => {
      if (Array.isArray(data)) {
        const numbers = data.map(i => i?.weekNumber || 0)
        numbers.push(schedule.week)
        return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "schedule" && numbers.includes(q.queryKey[1]) })
      }
      const week = (data as any)?.weekNumber || 0
      if (week) {
        queryClient.invalidateQueries({ queryKey: ["schedule", week] })
        queryClient.invalidateQueries({ queryKey: ["schedule", schedule.week] })
      } else
        queryClient.invalidateQueries({ queryKey: ["schedule"] })
    }
  })

  const editCustomization = useMutation({
    mutationKey: ["customLesson", "add"],
    mutationFn: (data: Partial<CustomizationData>) => {
      const promise = editCustomLesson({ customizationData: data })
      toast.promise(promise, { loading: "Обновляем...", error: "Произошла ошибка", success: "Пара изменена" })
      return promise
    },
    onSuccess: (data: unknown) => {
      if (Array.isArray(data)) {
        const numbers = data.map(i => i?.weekNumber || 0)
        return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "schedule" && numbers.includes(q.queryKey[1]) })
      }
      const week = (data as any)?.weekNumber || 0
      if (week)
        queryClient.invalidateQueries({ queryKey: ["schedule", week] })
      else
        queryClient.invalidateQueries({ queryKey: ["schedule"] })
    }
  })

  function confirmEditCustomization() {
    console.log("Confirm edit", lesson, customizationData, lessonTimeslot)
    const custom = Object.assign({}, lessonTimeslot, customizationData)
    console.log("Final: ", custom)
    if (custom.id) {
      editCustomization.mutate(custom)
    } else {
      addCustomization.mutate(custom)
    }
  }

  return (
    <Dialog open={isDeleteDialogOpen || isEditDialogOpen}>

      <ScheduleViewer schedule={schedule} editingEnabled={true} />

      {
        isEditDialogOpen && (
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Редактировние пары</DialogTitle>
            </DialogHeader >

            <ScheduleLessonEditor lesson={lesson} time={lessonTimeslot!} />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant={"default"} onClick={close}>Отмена</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant={"secondary"} onClick={() => { close(); confirmEditCustomization() }}>Подтвердить</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent >
        )
      }
      {isDeleteDialogOpen && (

        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Сброс кастомной пары</DialogTitle>
            <DialogDescription>
              Данное действие отменит все изменения, примянённые к этой паре<br />
              Отменить это будет невозможно
            </DialogDescription>
          </DialogHeader >
          <DialogFooter>
            <DialogClose asChild>
              <Button onClick={close}>Отмена</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant={"destructive"} onClick={() => { close(); resetCustomization.mutate() }}>{lesson?.original?.id ? "Сбросить" : "Удалить"}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent >
      )
      }
    </Dialog >
  );
}

