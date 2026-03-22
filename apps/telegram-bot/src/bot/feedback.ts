import { CommandGroup } from "@grammyjs/commands";
import type { Context } from "./types";
import { InlineKeyboard, type Bot } from "grammy";
import { api } from "@/serverClient";
import { env } from "@/env";
import log from "@/logger";

export const feedbackCommands = new CommandGroup<Context>();

export async function initFeedback(bot: Bot<Context>) {
  const commands = feedbackCommands;

  commands.command("bug", "Сообщить об ошибке", async (ctx) => {
    const user = ctx.from;
    if (!user) return;

    const { data, error } = await api.tasks.scheduleMessages.post([
      {
        chatId: env.SCHED_BOT_ADMIN_TGID.toString(),
        text: `\
Bug report!
User: @${user.username} (${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}) #${user.id}
Text: ${ctx.msg.text.slice(4).trim() || "<no text>"}
Time: ${new Date().toISOString()}
        `,
        sendAt: new Date(),
        entities: [],
        source: `bugReport/${user.id}`,
      },
    ]);

    log.info(
      `Bug report from @${user.username} (${user.first_name}${user.last_name ? ` ${user.last_name}` : ""})`,
      {
        user: user.id,
        tag: "BUG",
      },
    );

    if (error || !data?.count) {
      return ctx.reply(
        `\
Произошла ошибка при попытке отправить сообщение об ошибке. <i>Иронично...</i>
Пожалуйста, попробуйте еще раз позже или свяжитесь с администратором бота.\
`,
        { parse_mode: "HTML" },
      );
    }

    return ctx.reply(
      `\
Сообщение отправлено!
Спасибо за помощь в улучшении бота.
Хотите ли вы получить уведомление, когда эта ошибка будет исправлена?
      `,
      {
        reply_markup: new InlineKeyboard()
          .text("Отмена", "bugReportCancel")
          .text("Нет, не нужно", "bugReportDontNotify")
          .text("Да, уведомить меня", "bugReportNotify")
          .row(),
      },
    );
  });

  bot.callbackQuery("bugReportCancel", async (ctx) => {
    const msg = ctx.callbackQuery.message;
    if (!msg) return;

    log.info(`User has CANCELLED the bug report`, {
      user: ctx.from.id,
      tag: "BUG",
    });

    await api.cache.notifications.invalidate.bySource.patch({
      source: `bugReport/${ctx.from.id}`,
      method: "is",
    });

    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `\
Не вопрос, но если столкнётесь с какими-либо ошибками в будущем - пожалуйста пропишите /bug [сообщение] что бы я знал где искать ошибки :D\
`,
    );

    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery("bugReportDontNotify", async (ctx) => {
    const msg = ctx.callbackQuery.message;
    if (!msg) return;

    log.info(`User has asked to NOT be notified`, {
      user: ctx.from.id,
      tag: "BUG",
    });

    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `\
Сообщение отправлено!
Спасибо за помощь в улучшении бота.
`,
    );

    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery("bugReportNotify", async (ctx) => {
    const msg = ctx.callbackQuery.message;
    if (!msg) return;

    log.info(`User has asked to be notified`, {
      user: ctx.from.id,
      tag: "BUG",
    });

    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `\
Сообщение отправлено!
Спасибо за помощь в улучшении бота.
Постараюсь уведомить вас, когда эта ошибка будет исправлена. (Надеюсь не забуду...)
`,
    );

    return ctx.answerCallbackQuery();
  });

  bot.use(commands);
  return commands;
}
