import { create } from "zustand"
import type { LessonDateTime, ScheduleLessonType } from "@/lib/types";

interface EditorState {
  isEditDialogOpen: boolean;
  isDeleteDialogOpen: boolean;
  lesson: Omit<ScheduleLessonType, "alts"> | null;
  time: LessonDateTime | null;
  // onEditConfirm: () => void;
  // onDeleteConfirm: () => void;
  // onEditCancel: () => void;
  // onDeleteCancel: () => void;

  openDeleteDialog: (options: { lesson: Omit<ScheduleLessonType, "alts"> }) => void;
  openEditDialog: (options: { lesson: Omit<ScheduleLessonType, "alts"> | null, time: LessonDateTime }) => void;

  close: () => void;
}

const useEditorState = create<EditorState>((set) => ({
  isEditDialogOpen: false,
  isDeleteDialogOpen: false,
  lesson: null,
  time: null,
  // onEditConfirm: () => { },
  // onDeleteConfirm: () => { },
  // onEditCancel: () => { },
  // onDeleteCancel: () => { },
  openDeleteDialog: ({ lesson }) => set({ lesson, isDeleteDialogOpen: true }),
  openEditDialog: ({ lesson, time }) => set({ lesson, time, isEditDialogOpen: true }),
  close: () => set({ isEditDialogOpen: false, isDeleteDialogOpen: false })
}))

export default useEditorState;

