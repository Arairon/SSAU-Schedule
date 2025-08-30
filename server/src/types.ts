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
  lastMessage?: TGMessage.TextMessage;
  tempMessages: { id: number; deleteAfter?: Date; deleteOn?: string[] }[];
  flags: string[];
  sceneData: any;
  loggedIn: boolean;
}

export interface Context extends TelegrafContext<Update> {
  session: Session & Session & Scenes.SceneSession<Session>;
  scene: Scenes.SceneContextScene<Context, Session>;
}
