import { User } from "@prisma/client";
import { Scenes, Context as TelegrafContext } from "telegraf";
import type { Message as TGMessage, Update } from "telegraf/types";

export type Message = {
  text?: TGMessage.TextMessage;
  photo?: TGMessage.PhotoMessage;
  video?: TGMessage.VideoMessage;
};

export interface SceneSession extends Scenes.SceneSessionData {}

export interface Session extends SceneSession {
  tempMessages: { id: number; deleteAfter?: Date; deleteOn?: string[] }[];
  sceneData: any;
  loggedIn: boolean;
  scheduleViewer: {
    message: number;
    week: number;
    groupId?: number;
  };
}

export interface Context extends TelegrafContext<Update> {
  session: Session & Session & Scenes.SceneSession<Session>;
  scene: Scenes.SceneContextScene<Context, Session>;
}
