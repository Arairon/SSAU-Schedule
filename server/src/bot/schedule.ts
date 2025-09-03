import {
  Markup,
  type Telegraf,
  type Context as TelegrafContext,
} from "telegraf";
import { fmt } from "telegraf/format";
import { type CallbackQuery, type Message, type Update } from "telegraf/types";
import { type Context } from "./types";
import log from "../logger";
import { db } from "../db";
import { formatBigInt } from "../lib/utils";
import { env } from "../env";
import { schedule } from "../lib/schedule";
import { findGroupOrOptions, UserPreferencesDefaults } from "../lib/misc";
import { handleError } from "./bot";
import { openSettings } from "./options";

export async function sendTimetable(
  ctx: Context,
  week: number,
  opts?: {
    groupId?: number;
    ignoreCached?: boolean;
    forceUpdate?: boolean;
    queryCtx?: TelegrafContext<Update.CallbackQueryUpdate<CallbackQuery>>;
    dontUpdateLastActive?: boolean;
  },
) {
  if (!ctx?.from?.id) {
    log.error(
      `Some otherwordly being requested a timetable... ${JSON.stringify(ctx)}`,
    );
    return;
  }
  if (week < 0 || week > 52) return;

  const startTime = process.hrtime.bigint();
  const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
  if (!user) {
    return ctx.reply(
      "Вы не найдены в базе данных. Пожалуйста пропишите /start",
    );
  }
  const group =
    opts?.groupId ?? ctx.session.scheduleViewer.groupId ?? undefined;

  const preferences = Object.assign(
    {},
    UserPreferencesDefaults,
    user.preferences,
  );

  const chatId = ctx.session.scheduleViewer.chatId || null;
  const existingMessage = ctx.session.scheduleViewer.message || null;
  const temp: {
    msg: Message.TextMessage | null;
    timeout: NodeJS.Timeout | null;
  } = { msg: null, timeout: null };
  if (existingMessage && chatId) {
    temp.timeout = setTimeout(() => {
      void ctx.telegram.editMessageCaption(
        chatId,
        existingMessage,
        undefined,
        "Создание изображения...",
      );
    }, 100);
  } else {
    temp.timeout = setTimeout(() => {
      void ctx.reply("Создание изображения...").then((m) => (temp.msg = m));
    }, 100);
  }

  let timetable;
  try {
    timetable = await schedule.getTimetableWithImage(user, week, {
      groupId: group,
      forceUpdate: opts?.forceUpdate ?? undefined,
      stylemap: preferences.theme,
    });
  } catch {
    return ctx.reply(fmt`
Произошла ошибка при обновлении.
Попробуйте повторно войти в аккаунт через /login
        `);
  } finally {
    if (temp.timeout) clearTimeout(temp.timeout);
    if (temp.msg) {
      try {
        await ctx.deleteMessage(temp.msg.message_id);
      } catch {}
    }
  }

  const buttonsMarkup = Markup.inlineKeyboard([
    [
      Markup.button.callback("⬅️", "schedule_button_prev"),
      Markup.button.callback("🔄", "schedule_button_refresh"),
      Markup.button.callback("➡️", "schedule_button_next"),
    ],
    [Markup.button.callback("⚙️ Настройки", "open_options")],
    ctx.from.id === env.SCHED_BOT_ADMIN_TGID
      ? [
          Markup.button.callback(
            "[admin] Обновить насильно",
            "schedule_button_forceupdate",
          ),
        ]
      : [],
  ]);

  if (existingMessage && chatId) {
    if (timetable.image.tgId) {
      log.debug(
        `Image already uploaded. Changing image inplace to ${timetable.image.tgId}`,
        { user: ctx.from.id },
      );
      try {
        await ctx.telegram.editMessageMedia(
          chatId,
          existingMessage,
          undefined,
          {
            type: "photo",
            media: timetable.image.tgId,
            caption: `Расписание на ${timetable.data.week} неделю`,
          },
          buttonsMarkup,
        );
      } catch {
        if (opts?.queryCtx) {
          await opts.queryCtx.answerCbQuery("Ничего не изменилось");
        }
      }
    } else {
      log.debug(`Image has no tgId, deleting old message and uploading new`, {
        user: ctx.from.id,
      });
      try {
        await ctx.deleteMessage(existingMessage);
      } catch {}
    }
  } else {
    log.debug(`Lost existing message or chatId, uploading new message`, {
      user: ctx.from.id,
    });
  }
  if (!existingMessage || !chatId || !timetable.image.tgId) {
    const image = timetable.image.tgId ?? { source: timetable.image.data };
    const msg = await ctx.replyWithPhoto(
      image,
      Object.assign({}, buttonsMarkup, {
        caption: `Расписание на ${timetable.data.week} неделю`,
      }),
    );
    if (timetable.image.tgId) {
      log.debug(`Reused already uploaded image #${timetable.image.id}`, {
        user: user.tgId,
      });
    } else {
      log.debug(
        `Uploaded new image ${msg.photo[0].file_id} from ${timetable.image.id}`,
        { user: user.tgId },
      );
    }
    await db.weekImage.update({
      where: { id: timetable.image.id },
      data: { tgId: msg.photo[0].file_id },
    });
    ctx.session.scheduleViewer.message = msg.message_id; // else keep existing
    ctx.session.scheduleViewer.chatId = msg.chat.id;
  }

  ctx.session.scheduleViewer.week = timetable.data.week;
  ctx.session.scheduleViewer.groupId = timetable.data.groupId;

  const endTime = process.hrtime.bigint();
  log.info(
    `[BOT] Image viewer ${timetable.image.stylemap}/${timetable.data.groupId}/${timetable.data.week}. Took ${formatBigInt(endTime - startTime)}ns`,
    { user: ctx.from.id },
  );
  if (!opts?.dontUpdateLastActive)
    await db.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    });
}

export async function initSchedule(bot: Telegraf<Context>) {
  bot.command("schedule", async (ctx) => {
    ctx.session.scheduleViewer = {
      chatId: ctx.chat.id,
      message: 0,
      week: 0,
    };
    const arg = ctx.message.text.split(" ").at(1);
    let week = 0;
    if (arg && !Number.isNaN(Number(arg))) week = Number(arg);
    sendTimetable(ctx, week).catch((e) => {
      return handleError(ctx, e as Error);
    });
  });

  bot.action("schedule_button_next", async (ctx) => {
    if (!ctx.session.scheduleViewer.message)
      ctx.session.scheduleViewer.message =
        ctx.callbackQuery.message?.message_id ?? 0;
    const week = ctx.session.scheduleViewer.week + 1;
    if (week === 53) {
      return ctx.answerCbQuery(
        "Расписания на 53 неделю не существует. Это первая неделя следующего года",
      );
    }
    sendTimetable(ctx, week, { queryCtx: ctx }).catch((e) => {
      return handleError(ctx, e as Error);
    });
  });

  bot.action("schedule_button_prev", async (ctx) => {
    if (!ctx.session.scheduleViewer.message)
      ctx.session.scheduleViewer.message =
        ctx.callbackQuery.message?.message_id ?? 0;
    const week = ctx.session.scheduleViewer.week - 1;
    if (week === 0) {
      return ctx.answerCbQuery("Расписания на нулевую неделю не существует");
    }
    sendTimetable(ctx, week, { queryCtx: ctx }).catch((e) => {
      return handleError(ctx, e as Error);
    });
  });

  bot.action("schedule_button_refresh", async (ctx) => {
    if (!ctx.session.scheduleViewer.message)
      ctx.session.scheduleViewer.message =
        ctx.callbackQuery.message?.message_id ?? 0;
    const week = ctx.session.scheduleViewer.week;
    sendTimetable(ctx, week, { queryCtx: ctx }).catch((e) => {
      return handleError(ctx, e as Error);
    });
  });

  bot.action("schedule_button_forceupdate", async (ctx) => {
    if (!ctx.session.scheduleViewer.message)
      ctx.session.scheduleViewer.message =
        ctx.callbackQuery.message?.message_id ?? 0;
    const week = ctx.session.scheduleViewer.week;
    return sendTimetable(ctx, week, { forceUpdate: true, queryCtx: ctx });
  });

  bot.action("open_options", (ctx) => openSettings(ctx));

  // 0 - 99 as a week number
  bot.hears(/^\d\d?$/, async (ctx) => {
    const text = ctx.message.text.trim();
    const week = parseInt(text);
    void ctx.deleteMessage(ctx.message.message_id).catch(() => {
      /* ignore */
    });
    return sendTimetable(ctx, week);
  });

  // 6101(-090301)?D? as a group number
  bot.hears(/^\d{4}(?:-\d+)?D?$/, async (ctx) => {
    const group = await findGroupOrOptions({
      groupName: ctx.message.text.trim(),
    });
    if (!group || (Array.isArray(group) && group.length === 0)) {
      return ctx.reply("Группа или похожие на неё группы не найдены");
    }
    if (Array.isArray(group)) {
      if (group.length === 1) {
        return sendTimetable(ctx, 0, { groupId: group[0].id });
      } else {
        return ctx.reply(
          `Найдены следующие группы:\n${group.map((gr) => gr.text).join(", ")}`,
        );
      }
    }
    return sendTimetable(ctx, 0, { groupId: group.id });
  });
}
