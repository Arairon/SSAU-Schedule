import { create } from "zustand"
import type { CustomizationData, LessonDateTime, ScheduleLessonType } from "@/lib/types";
import { getLessonCustomization } from "@/lib/utils";

interface EditorState {
  isEditDialogOpen: boolean;
  isDeleteDialogOpen: boolean;
  lesson: Omit<ScheduleLessonType, "alts"> | null;
  time: LessonDateTime | null;
  customizationData: Partial<CustomizationData>;
  setCustomizationData: (data: Partial<CustomizationData>) => void
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
  customizationData: {},
  setCustomizationData: (customizationData: Partial<CustomizationData>) => set({ customizationData }),
  // onEditConfirm: () => { },
  // onDeleteConfirm: () => { },
  // onEditCancel: () => { },
  // onDeleteCancel: () => { },
  openDeleteDialog: ({ lesson }) => set({ lesson, isDeleteDialogOpen: true, customizationData: {} }),
  openEditDialog: ({ lesson, time }) =>
    set({ lesson, time, isEditDialogOpen: true, customizationData: lesson ? getLessonCustomization(lesson) : time }),
  close: () => set({ isEditDialogOpen: false, isDeleteDialogOpen: false, customizationData: {} })
}))

export default useEditorState;

