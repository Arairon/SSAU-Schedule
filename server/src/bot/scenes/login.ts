import { Markup, Scenes } from "telegraf";
import { message } from "telegraf/filters";

import { Context } from "../types";
import log from "../../logger";
import { db } from "../../db";
import { fmt } from "telegraf/format";
import { lk } from "../../lib/lk";
import { getPersonShortname } from "../../lib/utils";

export const loginScene = new Scenes.BaseScene<Context>("LK_LOGIN");

type loginSceneData = {
  messageId: number;
  username: string;
  password: string;
  userId: number;
  name: string;
};

loginScene.enter(async (ctx: Context) => {
  const userId = ctx?.from?.id;
  if (!userId) return ctx.scene.leave();
  log.debug("Entered login scene", { user: userId });
  ctx.session.sceneData = {
    messageId: 0,
    username: "",
    password: "",
    name: "",
  } as loginSceneData;
  const msg = await ctx.reply(
    fmt`
Вход в личный кабинет
Введите логин:
    `,
    Markup.inlineKeyboard([
      Markup.button.callback("❌ Отмена", "login_cancel"),
    ]),
  );
  ctx.session.sceneData.messageId = msg.message_id;
});

loginScene.on(message("text"), async (ctx) => {
  const sceneData = ctx.session.sceneData as loginSceneData;
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (text === "/login") return;

  if (!sceneData.username) {
    // Username input
    sceneData.username = text;
    ctx.deleteMessage(ctx.message.message_id);
    const msg = await ctx.telegram.editMessageText(
      ctx.chat.id,
      ctx.session.sceneData.messageId,
      undefined,
      fmt`
Вход в личный кабинет
Логин: ${text}
Введите пароль:
    `,
      Markup.inlineKeyboard([
        Markup.button.callback("❌ Отмена", "login_cancel"),
        Markup.button.callback("⬅️ Назад", "login_reenter"),
      ]),
    );
  } else if (!sceneData.password) {
    // Password input
    sceneData.password = text;
    await ctx.deleteMessage(ctx.message.message_id);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      ctx.session.sceneData.messageId,
      undefined,
      fmt`
Вход в личный кабинет
Логин: ${sceneData.username}
Пароль: \*\*\*\*\*\*\*\*
Пробуем войти...
    `,
      Markup.inlineKeyboard([]),
    );
    const { username, password } = sceneData;
    const user = await db.user.findUnique({ where: { tgId: userId } });
    ctx.session.sceneData.userId = user!.id;
    const loginRes = await lk.login(user!, { username, password });
    if (!loginRes.ok) {
      sceneData.password = "";
      const msg = await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.session.sceneData.messageId,
        undefined,
        fmt`
Вход в личный кабинет
Логин: ${sceneData.username}
Пароль: \*\*\*\*\*\*\*\*
Ошибка входа: "${loginRes.error!}: ${loginRes.message!}"
Можете попробовать ввести пароль ещё раз или вернутся назад
    `,
        Markup.inlineKeyboard([
          Markup.button.callback("❌ Отмена", "login_cancel"),
          Markup.button.callback("⬅️ Назад", "login_reenter"),
        ]),
      );
      return;
    } else {
      const upd = await lk.updateUserInfo(user!);
      sceneData.name = upd.ok ? (upd.data?.fullname ?? "") : "";
      const msg = await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.session.sceneData.messageId,
        undefined,
        fmt`
Вход в личный кабинет
Логин: ${sceneData.username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${sceneData.name ? `Вы вошли как '${getPersonShortname(sceneData.name)}'` : ``}
Сохранить данные для входа в базе данных?
(Данные хранятся в зашифрованном виде и используются только если ЛК по той или иной причине прервёт сессию. Сохранять данные необязательно)
    `,
        Markup.inlineKeyboard([
          Markup.button.callback("❌ Нет", "login_complete_dontsave"),
          Markup.button.callback("✅ Да", "login_complete_save"),
        ]),
      );
    }
  }
});

loginScene.action("login_complete_dontsave", (ctx) => {
  const sceneData = ctx.session.sceneData as loginSceneData;
  ctx.telegram.editMessageText(
    ctx.chat?.id,
    ctx.session.sceneData.messageId,
    undefined,
    fmt`
Вход в личный кабинет
Логин: ${sceneData.username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${sceneData.name ? `Вы вошли как '${getPersonShortname(sceneData.name)}'` : ``}`,
    Markup.inlineKeyboard([]),
  );
  ctx.session.loggedIn = true;
  ctx.scene.leave();
});

loginScene.action("login_complete_save", async (ctx) => {
  const sceneData = ctx.session.sceneData as loginSceneData;
  const { username, password } = sceneData;
  await lk.saveCredentials(ctx.session.sceneData.userId, {
    username,
    password,
  });
  ctx.telegram.editMessageText(
    ctx.chat?.id,
    ctx.session.sceneData.messageId,
    undefined,
    fmt`
Вход в личный кабинет
Логин: ${sceneData.username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${sceneData.name ? `Вы вошли как '${getPersonShortname(sceneData.name)}'` : ``}
Данные для входа сохранены`,
    Markup.inlineKeyboard([]),
  );
  ctx.session.loggedIn = true;
  ctx.scene.leave();
});

loginScene.action("login_cancel", (ctx) => {
  if (ctx.session.sceneData.messageId)
    ctx.deleteMessage(ctx.session.sceneData.messageId);
  ctx.scene.leave();
});

loginScene.action("login_reenter", (ctx) => {
  if (ctx.session.sceneData.messageId)
    ctx.deleteMessage(ctx.session.sceneData.messageId);
  ctx.scene.reenter();
});
