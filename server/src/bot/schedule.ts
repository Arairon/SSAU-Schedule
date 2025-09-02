import { Markup, Telegraf, type Context as TelegrafContext } from "telegraf";
import { Context } from "./types";
import log from "../logger";
import { db } from "../db";
import { formatBigInt } from "../lib/utils";
import { env } from "../env";
import { schedule } from "../lib/schedule";
import { fmt } from "telegraf/format";
import { CallbackQuery, Message, Update } from "telegraf/types";
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
    ctx.reply("Вы не найдены в базе данных. Пожалуйста пропишите /start");
    return;
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
    temp.timeout = setTimeout(async () => {
      await ctx.telegram.editMessageCaption(
        chatId,
        existingMessage,
        undefined,
        "Создание изображения...",
      );
    }, 100);
  } else {
    temp.timeout = setTimeout(async () => {
      temp.msg = await ctx.reply("Создание изображения...");
    }, 100);
  }

  let timetable;
  try {
    timetable = await schedule.getTimetableWithImage(user!, week, {
      groupId: group,
      forceUpdate: opts?.forceUpdate ?? undefined,
      stylemap: preferences.theme,
    });
  } catch {
    ctx.reply(fmt`
Произошла ошибка при обновлении.
Попробуйте повторно войти в аккаунт через /login
        `);
    return;
  } finally {
    if (temp.timeout) clearTimeout(temp.timeout);
    if (temp.msg) {
      ctx.deleteMessage(temp.msg.message_id);
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
      } catch (e) {
        if (opts?.queryCtx) {
          opts.queryCtx.answerCbQuery("Ничего не изменилось");
        }
      }
    } else {
      log.debug(`Image has no tgId, deleting old message and uploading new`, {
        user: ctx.from.id,
      });
      ctx.deleteMessage(existingMessage);
    }
  } else {
    log.debug(`Lost existing message or chatId, uploading new message`, {
      user: ctx.from.id,
    });
  }
  if (!existingMessage || !chatId || !timetable.image.tgId) {
    const msg = await ctx.replyWithPhoto(
      { source: timetable.image.data },
      Object.assign({}, buttonsMarkup, {
        caption: `Расписание на ${timetable.data.week} неделю`,
      }),
    );
    log.debug(
      `Uploaded new image ${msg.photo[0].file_id} from ${timetable.image.id}`,
    );
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
  log.debug(
    `[BOT] Image viewer [F:${timetable.data.isCommon} I:${timetable.data.withIet}] ${timetable.image.stylemap}/${timetable.data.groupId}/${timetable.data.week}. Took ${formatBigInt(endTime - startTime)}ns`,
    { user: ctx.from.id },
  );
  if (!opts?.dontUpdateLastActive)
    db.user.update({
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
      handleError(ctx, e);
    });
  });

  bot.action("schedule_button_next", async (ctx) => {
    const week = ctx.session.scheduleViewer.week + 1;
    if (week === 53) {
      ctx.answerCbQuery(
        "Расписания на 53 неделю не существует. Это первая неделя следующего года",
      );
      return;
    }
    sendTimetable(ctx, week, { queryCtx: ctx }).catch((e) => {
      handleError(ctx, e);
    });
  });

  bot.action("schedule_button_prev", async (ctx) => {
    const week = ctx.session.scheduleViewer.week - 1;
    if (week === 0) {
      ctx.answerCbQuery("Расписания на нулевую неделю не существует");
      return;
    }
    sendTimetable(ctx, week, { queryCtx: ctx }).catch((e) => {
      handleError(ctx, e);
    });
  });

  bot.action("schedule_button_refresh", async (ctx) => {
    const week = ctx.session.scheduleViewer.week;
    sendTimetable(ctx, week, { queryCtx: ctx }).catch((e) => {
      handleError(ctx, e);
    });
  });

  bot.action("schedule_button_forceupdate", async (ctx) => {
    const week = ctx.session.scheduleViewer.week;
    sendTimetable(ctx, week, { forceUpdate: true, queryCtx: ctx });
  });

  bot.action("open_options", (ctx) => openSettings(ctx));

  // 0 - 99 as a week number
  bot.hears(/^\d\d?$/, async (ctx) => {
    const text = ctx.message.text.trim();
    const week = parseInt(text);
    ctx.deleteMessage(ctx.message.message_id);
    sendTimetable(ctx, week);
  });

  // 6101(-090301)?D? as a group number
  bot.hears(/^\d{4}(?:-\d+)?D?$/, async (ctx) => {
    const group = await findGroupOrOptions({
      groupName: ctx.message.text.trim(),
    });
    if (!group || (Array.isArray(group) && group.length === 0)) {
      ctx.reply("Группа или похожие на неё группы не найдены");
      return;
    }
    if (Array.isArray(group)) {
      if (group.length === 1) {
        sendTimetable(ctx, 0, { groupId: group[0].id });
      } else {
        ctx.reply(
          `Найдены следующие группы:\n${group.map((gr) => gr.text).join(", ")}`,
        );
      }
      return;
    }
    sendTimetable(ctx, 0, { groupId: group.id });
  });
}
