import {
  InlineKeyboard,
  type Bot,
  type Context as GrammyContext,
} from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";

import type { Context } from "../types";
import log from "@/logger";
import { getPersonShortname } from "@ssau-schedule/shared/utils";
import { api } from "@/serverClient";

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
    api.user
      .tgid({ id: userId })
      .get()
      .then((res) => res.data),
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
    api.user
      .id({ id: user.id })
      .lk.login.post({ username, password, saveCredentials: false }),
  );
  const loginResData = loginRes.data;
  if (!loginResData) {
    return ctx.api
      .editMessageText(
        msg.chat.id,
        msg.message_id,
        `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Ошибка входа: "Нет ответа от сервера"
Можете попробовать ввести пароль ещё раз или отменить вход через /cancel
    `,
      )
      .catch(); // Ignore "message is not modified" error
  }
  while (!loginResData.success) {
    await ctx.api
      .editMessageText(
        msg.chat.id,
        msg.message_id,
        `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Ошибка входа: "${loginResData.error}"
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
    await ctx.api
      .editMessageText(
        msg.chat.id,
        msg.message_id,
        `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Пробуем войти...
    `,
      )
      .catch(); // Ignore "message is not modified" error
    loginRes = await conversation.external(() =>
      api.user
        .id({ id: user.id })
        .lk.login.post({ username, password, saveCredentials: false }),
    );
  }
  if (loginRes.data?.success) {
    await conversation.external(() => {
      void api.cache.week.invalidate.patch({ owner: user.id });
    });
    const user = loginRes.data.user;
    await ctx.api
      .editMessageText(
        msg.chat.id,
        msg.message_id,
        `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${user.fullname ? `Вы вошли как '${getPersonShortname(user.fullname)}'` : ``}
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
Вход успешен! ${user.fullname ? `Вы вошли как '${getPersonShortname(user.fullname)}'` : ``}`,
          );
        },
      },
    );

    if (saveAnswer.match) {
      await conversation.external(() =>
        api.user
          .id({ id: user.id })
          .lk.saveCredentials.post({ username, password }),
      );
      log.debug("Login successful, credentials saved", { user: userId });
      await ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${user.fullname ? `Вы вошли как '${getPersonShortname(user.fullname)}'` : ``}
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
