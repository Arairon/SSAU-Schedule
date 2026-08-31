import type { Context as GrammyContext, SessionFlavor } from "grammy"
import type { ConversationFlavor } from "@grammyjs/conversations"

export type ScheduleViewerMode = null | "group" | "teacher"

export type ScheduleViewer = {
  message: number
  chatId: number
  week: number

  mode: ScheduleViewerMode
  groupId?: number
  teacherId?: number
}

export interface Session {
  sceneData: any //eslint-disable-line @typescript-eslint/no-explicit-any
  options: {
    message: number
    menu: string
    updText: string | null
    notificationsRescheduleTimeout: NodeJS.Timeout | null
  }
  startedScheduleUpdateAt: Date | null
  scheduleViewer: ScheduleViewer
}

export type Context = ConversationFlavor<GrammyContext & SessionFlavor<Session>>
