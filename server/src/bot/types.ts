import type { Context as GrammyContext, SessionFlavor } from "grammy";
import type { ConversationFlavor } from "@grammyjs/conversations";

export interface Session {
  sceneData: any; //eslint-disable-line @typescript-eslint/no-explicit-any
  loggedIn: boolean;
  options: {
    message: number;
    menu: string;
    updText: string | null;
  };
  runningScheduleUpdate: boolean;
  scheduleViewer: {
    message: number;
    chatId: number;
    week: number;
    groupId?: number;
  };
}

export type Context = ConversationFlavor<
  GrammyContext & SessionFlavor<Session>
>;
