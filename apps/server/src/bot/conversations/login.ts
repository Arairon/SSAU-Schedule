import {
  InlineKeyboard,
  type Bot,
  type Context as GrammyContext,
} from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";

import type { Context } from "../types";
import log from "@/logger";
import { db } from "@/db";
import { lk } from "@/ssau/lk";
import { getPersonShortname } from "@ssau-schedule/shared/utils";

async function loginConversation(
  conversation: Conversation,
  ctx: GrammyContext,
) {
  const userId = ctx.from?.id;
  if (!userId) {
    return ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
      parse_mode: "HTML",
    });
  }
  const user = await conversation.external(() =>
    db.user.findUnique({ where: { tgId: userId } }),
  );
  if (!user) {
    return ctx.reply(
      "Вас не существует в базе данных. Пожалуйста пропишите /start",
    );
  }
  log.debug("Running login conversation", { user: userId });

  const msg = await ctx.reply(`
Вход в личный кабинет
(Для отмены используйте /cancel)
Введите логин:
    `);

  // User input
  const usernameMsg = await conversation.waitFor("message:text");
  if (!usernameMsg.message.text || usernameMsg.message.text === "/cancel")
    return ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `Вход в личный кабинет отменён`,
    );
  const username = usernameMsg.message.text;
  await ctx.api.deleteMessage(
    usernameMsg.chat.id,
    usernameMsg.message.message_id,
  );

  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    `
Вход в личный кабинет
Логин: ${username}
Введите пароль:
    `,
  );

  // User input
  const passwordMsg = await conversation.waitFor("message:text");
  if (!passwordMsg.message.text || passwordMsg.message.text === "/cancel")
    return ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `Вход в личный кабинет отменён`,
    );
  const password = passwordMsg.message.text;
  await ctx.api.deleteMessage(
    passwordMsg.chat.id,
    passwordMsg.message.message_id,
  );
  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Пробуем войти...
    `,
  );
  let loginRes = await conversation.external(() =>
    lk.login(user, { username, password }),
  );
  while (!loginRes.ok) {
    await ctx.api
      .editMessageText(
        msg.chat.id,
        msg.message_id,
        `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Ошибка входа: "${loginRes.error}: ${loginRes.message!}"
Можете попробовать ввести пароль ещё раз или отменить вход через /cancel
    `,
      )
      .catch(); // Ignore "message is not modified" error
    const passwordMsg = await conversation.waitFor("message:text");
    if (!passwordMsg.message.text || passwordMsg.message.text === "/cancel")
      return ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `Вход в личный кабинет отменён`,
      );
    const password = passwordMsg.message.text;
    await ctx.api.deleteMessage(
      passwordMsg.chat.id,
      passwordMsg.message.message_id,
    );
    loginRes = await conversation.external(() =>
      lk.login(user, { username, password }),
    );
  }
  if (loginRes.ok) {
    await lk.updateUserInfo(user);
    await ctx.api
      .editMessageText(
        msg.chat.id,
        msg.message_id,
        `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${loginRes.data?.fullname ? `Вы вошли как '${getPersonShortname(loginRes.data.fullname)}'` : ``}
Сохранить данные для входа в базе данных?
(Данные хранятся в зашифрованном виде и используются только если ЛК по той или иной причине прервёт сессию. Сохранять данные необязательно)
    `,
        {
          reply_markup: new InlineKeyboard()
            .text("❌ Нет", "login_complete_dontsave")
            .text("✅ Да", "login_complete_save"),
        },
      )
      .catch(); // Ignore "message is not modified" error
    const saveAnswer = await conversation.waitForCallbackQuery(
      /login_complete_save/,
      {
        otherwise: (ctx) => {
          log.debug("Logged in without saving", { user: userId });
          return ctx.api.editMessageText(
            msg.chat.id,
            msg.message_id,
            `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${loginRes.data?.fullname ? `Вы вошли как '${getPersonShortname(loginRes.data.fullname)}'` : ``}`,
          );
        },
      },
    );

    if (saveAnswer.match) {
      await conversation.external(() =>
        lk.saveCredentials(user.id, { username, password }),
      );
      log.debug("Login successful, credentials saved", { user: userId });
      await ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${loginRes.data?.fullname ? `Вы вошли как '${getPersonShortname(loginRes.data.fullname)}'` : ``}
Данные для входа сохранены`,
      );
    } else {
      log.debug("Login successful, credentials not saved", { user: userId });
      return; // Handled in "otherwise"
    }
  } else {
    // This should never happen
  }
}

export async function initLogin(bot: Bot<Context>) {
  bot.use(createConversation(loginConversation, { id: "LK_LOGIN" }));
}
