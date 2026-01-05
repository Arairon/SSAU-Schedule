import { type ScheduleType } from "@/lib/types";
import ScheduleViewer from "./ScheduleViewer";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import useEditorState from "@/hooks/useEditorState";
import ScheduleLessonEditor from "./ScheduleLessonEditor";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTg } from "@/hooks/useTg";
import { deleteCustomLesson } from "@/api/api";
import { toast } from "sonner";



export default function ScheduleViewerWithEditor({ schedule }: { schedule: ScheduleType; }) {
  const { isDeleteDialogOpen, isEditDialogOpen, close, lesson, time: lessonTimeslot } = useEditorState()
  const queryClient = useQueryClient()
  const {raw: rawTgInfo} = useTg()

  const resetCustomization = useMutation({
    mutationKey: ["customLesson", "reset"],
    mutationFn: ()=>{
      if (!rawTgInfo) throw new Error("Unable to edit lessons outside of telegram")
      if(!lesson) throw new Error("Attempted to edit a null lesson")

      const promise = deleteCustomLesson({rawTgInfo, id: lesson.id})
      toast.promise(promise, {loading: "Обновляем...", error: "Произошла ошибка", success: "Изменения сброшены"})
      return promise
    },
    onSuccess: ()=>{
      queryClient.invalidateQueries({queryKey: ["schedule"]})
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

