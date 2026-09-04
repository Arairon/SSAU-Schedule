import { InlineKeyboard, type Bot, type Context as GrammyContext } from "grammy"
import { type Conversation, createConversation } from "@grammyjs/conversations"

import type { Context } from "../types"
import log from "@/bot/logger"
import { getPersonShortname } from "@ssau-schedule/shared/utils"
import { api } from "@/bot/serverClient"
import { promptForText } from "./utils"

type LoginConversationOptions = {
  msg?: {
    chat: {
      id: number
    },
    message_id: number,
  }
}

export async function loginConversation(
  conversation: Conversation,
  ctx: GrammyContext,
  opts: LoginConversationOptions | null = null
) {
  const userId = ctx.from?.id
  if (!userId) {
    await ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
      parse_mode: "HTML",
    })
    return { ok: false, cancelled: true }
  }
  const user = await conversation.external(() =>
    api.user
      .tgid({ id: userId })
      .get()
      .then((res) => res.data),
  )
  if (!user) {
    await ctx.reply(
      "Вас не существует в базе данных. Пожалуйста пропишите /start",
    )
    return { ok: false, cancelled: true }
  }
  await conversation.external(() => {
    log.debug("Running login conversation", { user: userId })
  })

  const msg = opts?.msg ?? (await ctx.reply("Вход в личный кабинет\nВведите логин:"))

  // User input

  const username = await promptForText(conversation, ctx, msg, opts?.msg ? "Вход в личный кабинет\nВведите логин:" : null, { retryUntilCaught: true })
  if (!username) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `Вход в личный кабинет отменён`,
    )
    return { ok: false, cancelled: true }
  }

  const password = await promptForText(conversation, ctx, msg, `\
Вход в личный кабинет
Логин: ${username}
Введите пароль:`, { muffleLog: true, retryUntilCaught: true })

  if (!password) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `Вход в личный кабинет отменён`,
    )
    return { ok: false, cancelled: true }
  }

  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Пробуем войти...
    `,
  )
  let loginRes = await conversation.external(() =>
    api.user
      .id({ id: user.id })
      .lk.login.post({ username, password, saveCredentials: false })
      .then((res) => {
        if (res.status === 422 || res.error?.status === 422)
          return { success: false as const, error: "Неверный запрос." }
        return res.data ?? res.error.value ?? null
      }),
  )
  if (!loginRes) {
    await conversation.external(() => {
      log.error(`Login failed: No response from server`, { user: userId })
    })
    await ctx.api
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
      .catch() // Ignore "message is not modified" error
  }

  while (!loginRes?.success) {
    await conversation.external(() => {
      log.warn(`Login failed: ${loginRes?.error}`, { user: userId })
    })
    await ctx.api
      .editMessageText(
        msg.chat.id,
        msg.message_id,
        `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Ошибка входа: "${loginRes?.error}"
Можете попробовать ввести пароль ещё раз или отменить вход через /cancel
    `,
      )
      .catch() // Ignore "message is not modified" error
    const password = await promptForText(conversation, ctx, msg, `\
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Ошибка входа: "${loginRes?.error}"
Можете попробовать ввести пароль ещё раз или отменить вход через /cancel`,
      { muffleLog: true, retryUntilCaught: true })
    if (!password) {
      await ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `Вход в личный кабинет отменён`,
      )
      return { ok: false, cancelled: true }
    }
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
      .catch() // Ignore "message is not modified" error
    loginRes = await conversation.external(() =>
      api.user
        .id({ id: user.id })
        .lk.login.post({ username, password, saveCredentials: false })
        .then((res) => {
          if (res.status === 422 || res.error?.status === 422)
            return { success: false as const, error: "Неверный запрос." }
          return res.data ?? res.error.value ?? null
        }),
    )
  }
  if (loginRes?.success) {
    const user = loginRes.user
    await conversation.external(() => {
      void api.cache.week.invalidate.patch({ owner: user.id })
    })
    await conversation.external(() => {
      log.debug(`Login successful`, { user: userId })
    })
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
      .catch() // Ignore "message is not modified" error
    const saveAnswer = await conversation.waitForCallbackQuery(
      /login_complete_save/,
      {
        otherwise: async (ctx) => {
          log.debug("Logged in without saving", { user: userId })
          await ctx.api.editMessageText(
            msg.chat.id,
            msg.message_id,
            `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${user.fullname ? `Вы вошли как '${getPersonShortname(user.fullname)}'` : ``}`,
          ).catch() // Ignore "message is not modified" error
        },
      },
    )

    if (saveAnswer.match) {
      await conversation.external(() =>
        api.user
          .id({ id: user.id })
          .lk.saveCredentials.post({ username, password })
          .then(() => null),
      )
      log.debug("Login successful, credentials saved", { user: userId })
      await ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${user.fullname ? `Вы вошли как '${getPersonShortname(user.fullname)}'` : ``}
Данные для входа сохранены`,
      ).catch() // Ignore "message is not modified" error
    } else {
      log.debug("Login successful, credentials not saved", { user: userId })
    }
    return { ok: true }
  } else {
    // This should never happen
  }
  return { ok: false, cancelled: false }
}

export async function initLogin(bot: Bot<Context>) {
  bot.use(createConversation<Context, GrammyContext>(loginConversation, { id: "LK_LOGIN" }))
}
