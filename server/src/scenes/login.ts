import { Markup, Scenes } from "telegraf";
import { message } from "telegraf/filters";

import { Context } from "../types";
import log from "../logger";
import { db } from "../db";
import { fmt } from "telegraf/format";
import { lk } from "../lib/lk";
import { getPersonShortname } from "../lib/utils";
import { deleteTempMessages } from "../bot";

export const loginScene = new Scenes.BaseScene<Context>("LK_LOGIN");

type loginSceneData = {
  username: string;
  password: string;
  name: string;
};

loginScene.enter(async (ctx: Context) => {
  const userId = ctx?.from?.id;
  if (!userId) return ctx.scene.leave();
  log.debug("Entered login scene", { user: userId });
  ctx.session.sceneData = {
    username: "",
    password: "",
    name: "",
  } as loginSceneData;
  const msg = await ctx.reply(
    fmt`
Вход в личный кабинет
Введите логин:
    `,
    Markup.inlineKeyboard([Markup.button.callback("❌ Отмена", "login_cancel")])
  );
  ctx.session.tempMessages.push({
    id: msg.message_id,
    deleteOn: ["scene_leave", "scene_next"],
  });
});

loginScene.on(message("text"), async (ctx) => {
  const sceneData = ctx.session.sceneData as loginSceneData;
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (text === "/login") return;

  if (!sceneData.username) {
    // Username input
    sceneData.username = text;
    ctx.session.tempMessages.push({
      id: ctx.message.message_id,
      deleteOn: ["scene_leave"],
    });
    await deleteTempMessages(ctx, "scene_next");
    const msg = await ctx.reply(
      fmt`
Вход в личный кабинет
Логин: ${text}
Введите пароль:
    `,
      Markup.inlineKeyboard([
        Markup.button.callback("❌ Отмена", "login_cancel"),
        Markup.button.callback("⬅️ Назад", "login_reenter"),
      ])
    );
    ctx.session.tempMessages.push({
      id: msg.message_id,
      deleteOn: ["scene_next", "scene_leave"],
    });
  } else if (!sceneData.password) {
    // Password input
    sceneData.password = text;
    await ctx.deleteMessage(ctx.message.message_id);
    await deleteTempMessages(ctx, "scene_next");
    const { username, password } = sceneData;
    const user = await db.user.findUnique({ where: { id: userId } });
    const loginRes = await lk.login(user!, { username, password });
    if (!loginRes.ok) {
      sceneData.password = "";
      const msg = await ctx.reply(
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
        ])
      );
      ctx.session.tempMessages.push({
        id: msg.message_id,
        deleteOn: ["scene_next", "scene_leave"],
      });
      return;
    } else {
      sceneData.password = "";
      const upd = await lk.updateUserInfo(user!);
      sceneData.name = upd.ok ? (upd.data?.fullname ?? "") : "";
      const msg = await ctx.reply(
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
        ])
      );
      ctx.session.tempMessages.push({
        id: msg.message_id,
        deleteOn: ["scene_next", "scene_leave"],
      });
    }
  }
});

loginScene.action("login_complete_dontsave", (ctx) => {
  const sceneData = ctx.session.sceneData as loginSceneData;
  ctx.reply(fmt`
Вход в личный кабинет
Логин: ${sceneData.username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${sceneData.name ? `Вы вошли как '${getPersonShortname(sceneData.name)}'` : ``}`);
  ctx.session.loggedIn = true;
  ctx.scene.leave();
});

loginScene.action("login_complete_save", async (ctx) => {
  const sceneData = ctx.session.sceneData as loginSceneData;
  const { username, password } = sceneData;
  await lk.saveCredentials(ctx.from.id, { username, password });
  ctx.reply(fmt`
Вход в личный кабинет
Логин: ${sceneData.username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${sceneData.name ? `Вы вошли как '${getPersonShortname(sceneData.name)}'` : ``}
Данные для входа сохранены`);
  ctx.session.loggedIn = true;
  ctx.scene.leave();
});

loginScene.action("login_cancel", (ctx) => {
  ctx.scene.leave();
});

loginScene.action("login_reenter", (ctx) => {
  ctx.scene.reenter();
});

loginScene.leave((ctx: Context) => {
  deleteTempMessages(ctx, "scene_leave");
});
