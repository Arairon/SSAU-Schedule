import { type Context as GrammyContext } from "grammy"
import type { Conversation } from "@grammyjs/conversations"
import log from "@/bot/logger"

type WaitOptions = {
  conversation: Conversation
  catchText?: boolean
  catchCallback?: boolean
  retryUntilCaught?: boolean
  muffleTextLog?: boolean
}

export function parseUpdate(update: GrammyContext) {
  if (update.callbackQuery && "data" in update.callbackQuery) {
    return {
      type: "callback" as const,
      data: update.callbackQuery.data,
      ctx: update,
    }
  } else if (update.message && "text" in update.message && update.message.text) {
    return {
      type: "message" as const,
      text: update.message.text.trim(),
      ctx: update
    }
  }
  return null
}

export async function wait({
  conversation,
  catchText = false,
  catchCallback = false,
  muffleTextLog = false,
  retryUntilCaught = false
}: WaitOptions) {
  while (true) {
    const update = parseUpdate(await conversation.wait())
    if (!update) {
      if (retryUntilCaught) continue
      else return null
    }

    if (update.type === "callback" && catchCallback) {
      log.debug(`[c] <cb> ${update.data}`, {
        user: update.ctx?.from?.id ?? -1
      })
      return update
    } else if (update.type === "message" && catchText) {
      log.debug(`[c] ${muffleTextLog ? "* hidden *" : update.text}`, {
        user: update.ctx?.from?.id ?? -1
      })
      return update
    }

    if (retryUntilCaught) {
      if (update.type === "callback") {
        await update.ctx.answerCallbackQuery("Действие недоступно во время диалога").catch()
      }
      // else if (update.type === "message") {
      //   await update.ctx.reply("Действие недоступно во время диалога").catch()
      // }
    }
    else return null
  }
}

export async function promptForText(
  conversation: Conversation,
  ctx: GrammyContext,
  msg: { chat: { id: number }; message_id: number },
  prompt: string | null,
  opts: {
    muffleLog?: boolean,
    retryUntilCaught?: boolean
  } = {}
): Promise<string | null> {
  if (prompt)
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, prompt).catch()

  while (true) {
    const input = await wait({ conversation, catchText: true, muffleTextLog: opts.muffleLog, retryUntilCaught: opts.retryUntilCaught })
    if (!input) continue
    const { ctx, text } = input
    if (!text) continue

    if (ctx.chat?.id && ctx.message?.message_id)
      await input.ctx.api
        .deleteMessage(ctx.chat.id, ctx.message.message_id)
        .catch()

    if (text === "/cancel") return null
    return text
  }
}