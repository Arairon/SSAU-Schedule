import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ScheduleViewer from "./ScheduleViewer";

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import ScheduleLessonEditor from "./ScheduleLessonEditor";
import type { ScheduleType } from "@/lib/types";
import useEditorState from "@/hooks/useEditorState";
import { deleteCustomLesson } from "@/api/api";
import { useAuth } from "@/hooks/useAuth";



export default function ScheduleViewerWithEditor({ schedule }: { schedule: ScheduleType; }) {
  const { isDeleteDialogOpen, isEditDialogOpen, close, lesson, time: lessonTimeslot } = useEditorState()
  const queryClient = useQueryClient()
  const { token } = useAuth()

  const resetCustomization = useMutation({
    mutationKey: ["customLesson", "reset"],
    mutationFn: () => {
      if (!token) throw new Error("Unable to edit lessons outside of telegram")
      if (!lesson) throw new Error("Attempted to edit a null lesson")

      const promise = deleteCustomLesson({ token, id: lesson.id })
      toast.promise(promise, { loading: "Обновляем...", error: "Произошла ошибка", success: "Изменения сброшены" })
      return promise
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] })
    }
  })

  function confirmEditCustomization() {
    console.log("Confirm edit", lesson)
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

