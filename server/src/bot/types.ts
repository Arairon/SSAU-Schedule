import type { Scenes, Context as TelegrafContext } from "telegraf";
import type { Message as TGMessage, Update } from "telegraf/types";

export type Message = {
  text?: TGMessage.TextMessage;
  photo?: TGMessage.PhotoMessage;
  video?: TGMessage.VideoMessage;
};

export interface Session extends Scenes.SceneSessionData {
  sceneData: any; //eslint-disable-line @typescript-eslint/no-explicit-any
  loggedIn: boolean;
  options: {
    message: number;
    menu: string;
    updText: string | null;
  };
  scheduleViewer: {
    message: number;
    chatId: number;
    week: number;
    groupId?: number;
  };
}

export interface Context extends TelegrafContext<Update> {
  session: Session & Scenes.SceneSession<Session>;
  scene: Scenes.SceneContextScene<Context, Session>;
}
