import { Markup, type Telegraf } from "telegraf";
import { fmt } from "telegraf/format";
import type { Context } from "./types";
import log from "../logger";
import { db } from "../db";
import { formatBigInt, getWeekFromDate } from "../lib/utils";
import { env } from "../env";
import { schedule } from "../lib/schedule";
import {
  findGroupOrOptions,
  generateTextLesson,
  UserPreferencesDefaults,
} from "../lib/misc";
import { handleError } from "./bot";
import { openSettings } from "./options";
import { lk } from "../lib/lk";

async function sendTimetable(
  ctx: Context,
  week: number,
  groupId?: number,
  opts?: { forceUpdate?: boolean },
) {
  if (ctx.session.runningScheduleUpdate) {
    const msg = await ctx.reply(
      "Обновление уже запущено, пожалуйста подождите.",
    );
    setTimeout(() => {
      ctx.deleteMessage(msg.message_id).catch(() => {
        log.warn(`Failed to delete temporary 'update already started' msg`);
      });
    }, 2500);
    return;
  }
  ctx.session.runningScheduleUpdate = true;
  try {
    const user = await db.user.findUnique({ where: { tgId: ctx?.from?.id } });
    if (!user) {
      return ctx.reply(
        "Вы не найдены в базе данных. Пожалуйста пропишите /start",
      );
    }
    const isAuthed = await lk.ensureAuth(user);
    const weekNumber = week === 0 ? 0 : Math.min(Math.max(week, 1), 52);
    const group = groupId
      ? await db.group.findUnique({ where: { id: groupId } })
      : null;

    const preferences = Object.assign(
      {},
      UserPreferencesDefaults,
      user.preferences,
    );

    log.debug(
      `[bot] Requested schedule ${preferences.theme}/${groupId}/${weekNumber} ${!isAuthed ? "(unauthed) " : ""}`,
      { user: ctx?.from?.id },
    );
    const startTime = process.hrtime.bigint();

    let tempMsgId: number | null = null;
    const creatingMessageTimeout = setTimeout(() => {
      try {
        ctx
          .reply("Создание изображения...")
          .then((m) => {
            tempMsgId = m.message_id;
          })
          .catch(() => {
            /*ignore*/
          });
      } catch {}
    }, 150);

    let timetable;
    try {
      timetable = await schedule.getTimetableWithImage(user, weekNumber, {
        groupId: group?.id ?? undefined,
        stylemap: preferences.theme,
        forceUpdate: opts?.forceUpdate ?? undefined,
        ignoreUpdate: !isAuthed,
      });
    } catch (e) {
      log.error(`Failed to get timetable ${String(e)}`, {
        user: ctx?.from?.id,
      });
      return ctx.reply(fmt`
Произошла ошибка при обновлении.
Попробуйте повторно войти в аккаунт через /login
        `);
    }

    clearTimeout(creatingMessageTimeout);
    if (tempMsgId) {
      try {
        await ctx.deleteMessage(tempMsgId);
      } catch {}
    }

    const buttonsMarkup = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "⬅️",
          `schedule_button_view_${groupId ?? 0}/${timetable.data.week - 1}`,
        ),
        Markup.button.callback(
          "🔄",
          `schedule_button_view_${groupId ?? 0}/${timetable.data.week}`,
        ),
        Markup.button.callback(
          "➡️",
          `schedule_button_view_${groupId ?? 0}/${timetable.data.week + 1}`,
        ),
      ],
      ctx?.chat?.type === "private"
        ? [Markup.button.callback("⚙️ Настройки", "open_options")]
        : [],
      ctx?.chat?.type === "private" &&
      ctx?.from?.id === env.SCHED_BOT_ADMIN_TGID
        ? [
            Markup.button.callback(
              "[admin] Обновить насильно",
              `schedule_button_view_${groupId ?? 0}/${week}/force`,
            ),
          ]
        : [],
    ]);

    const msg = await ctx.replyWithPhoto(
      timetable.image.tgId ?? { source: timetable.image.data },
      {
        caption:
          `Расписание на ${timetable.data.week} неделю` +
          (timetable.data.week === getWeekFromDate(new Date())
            ? " (текущая)"
            : "") +
          (group ? `\nДля группы ${group.name}` : "") +
          (!isAuthed
            ? "\n⚠️ Не выполнен вход в личный кабинет. Расписание взято из базы данных и может быть неточным."
            : ""),
        reply_markup: buttonsMarkup.reply_markup,
      },
    );
    if (!timetable.image.tgId) {
      log.debug(`Image had no tgId, uploaded new ${msg.photo[0].file_id}`, {
        user: ctx?.from?.id,
      });
      await db.weekImage.update({
        where: { id: timetable.image.id },
        data: { tgId: msg.photo[0].file_id },
      });
    }
    const endTime = process.hrtime.bigint();
    log.debug(
      `[bot] Image viewer ${timetable.image.stylemap}/${timetable.data.groupId}/${timetable.data.week}. Took ${formatBigInt(endTime - startTime)}ns`,
      { user: ctx?.from?.id },
    );
    ctx.session.scheduleViewer.message = msg.message_id;
    ctx.session.scheduleViewer.chatId = msg.chat.id;
    ctx.session.scheduleViewer.week = timetable.data.week;
    ctx.session.scheduleViewer.groupId = group?.id ?? undefined;
  } catch (e) {
    log.error(`Failed to send timetable ${String(e)}`, { user: ctx?.from?.id });
    return ctx.reply(
      fmt`
Произошла неизвестная ошибка при отправке.
Попробуйте повторно войти в аккаунт через /login
        `,
    );
  } finally {
    ctx.session.runningScheduleUpdate = false;
  }
}

export async function updateTimetable(
  ctx: Context,
  week: number,
  groupId?: number,
  opts?: { forceUpdate?: boolean },
) {
  if (ctx.session.runningScheduleUpdate) {
    return ctx.answerCbQuery("Обновление уже запущено, пожалуйста подождите.");
  }
  ctx.session.runningScheduleUpdate = true;
  try {
    const userId = ctx?.from?.id;
    const chat = ctx.chat;
    const msgId =
      ctx?.callbackQuery?.message?.message_id ??
      ctx.session.scheduleViewer.message;
    if (!msgId || !chat) {
      log.error(`No message ID in callbackQuery`, { user: userId });
      return ctx.answerCbQuery(
        "Произошла ошибка, пожалуйста используйте /schedule.",
      );
    }
    const user = await db.user.findUnique({ where: { tgId: userId } });
    if (!user) {
      return ctx.reply(
        "Вы не найдены в базе данных. Пожалуйста пропишите /start",
      );
    }
    const isAuthed = await lk.ensureAuth(user);
    const weekNumber = week === 0 ? 0 : Math.min(Math.max(week, 1), 52);
    const group = groupId
      ? await db.group.findUnique({ where: { id: groupId } })
      : null;

    const preferences = Object.assign(
      {},
      UserPreferencesDefaults,
      user.preferences,
    );

    log.debug(
      `[bot.viewer] Requested schedule ${preferences.theme}/${groupId}/${weekNumber} ${!isAuthed ? "(unauthed) " : ""}`,
      { user: userId },
    );
    const startTime = process.hrtime.bigint();

    const creatingMessageTimeout = setTimeout(() => {
      try {
        ctx
          .editMessageCaption("Создание изображения...", {
            reply_markup: Markup.inlineKeyboard([]).reply_markup,
          })
          .catch(() => {
            /*ignore*/
          });
      } catch {}
    }, 150);

    let timetable;
    try {
      timetable = await schedule.getTimetableWithImage(user, weekNumber, {
        groupId: group?.id ?? undefined,
        stylemap: preferences.theme,
        forceUpdate: opts?.forceUpdate ?? undefined,
        ignoreUpdate: !isAuthed,
      });
    } catch (e) {
      log.error(`Failed to get timetable ${String(e)}`, { user: userId });
      return ctx.reply(fmt`
Произошла ошибка при обновлении.
Попробуйте повторно войти в аккаунт через /login
        `);
    }

    clearTimeout(creatingMessageTimeout);

    if (!timetable.image.tgId) {
      log.debug(`Image had no tgId, uploading new`, { user: userId });
      try {
        // TODO: UploadMedia instead.
        return ctx.reply(
          "[WIP] Изображение не отправлено. Дождитесь перехода на grammY :D",
        );
      } catch {}
      return;
    }

    const buttonsMarkup = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "⬅️",
          `schedule_button_view_${groupId ?? 0}/${timetable.data.week - 1}`,
        ),
        Markup.button.callback(
          "🔄",
          `schedule_button_view_${groupId ?? 0}/${timetable.data.week}`,
        ),
        Markup.button.callback(
          "➡️",
          `schedule_button_view_${groupId ?? 0}/${timetable.data.week + 1}`,
        ),
      ],
      chat.type === "private"
        ? [Markup.button.callback("⚙️ Настройки", "open_options")]
        : [],
      chat.type === "private" && userId === env.SCHED_BOT_ADMIN_TGID
        ? [
            Markup.button.callback(
              "[admin] Обновить насильно",
              `schedule_button_view_${groupId ?? 0}/${week}/force`,
            ),
          ]
        : [],
    ]);

    try {
      await ctx.telegram.editMessageMedia(
        chat.id,
        msgId,
        undefined,
        {
          type: "photo",
          media: timetable.image.tgId,
          caption:
            `Расписание на ${timetable.data.week} неделю` +
            (timetable.data.week === getWeekFromDate(new Date())
              ? " (текущая)"
              : "") +
            (group ? `\nДля группы ${group.name}` : "") +
            (!isAuthed
              ? "\n⚠️ Не выполнен вход в личный кабинет. Расписание взято из базы данных и может быть неточным."
              : ""),
        },
        buttonsMarkup,
      );
    } catch {
      log.debug(`Error: unchanged. Ignoring`, { user: userId });
      await ctx.answerCbQuery("Ничего не изменилось");
    }
    const endTime = process.hrtime.bigint();
    log.debug(
      `[bot] Image viewer update ${timetable.image.stylemap}/${timetable.data.groupId}/${timetable.data.week}. Took ${formatBigInt(endTime - startTime)}ns`,
      { user: userId },
    );

    ctx.session.scheduleViewer.message = msgId;
    ctx.session.scheduleViewer.chatId = chat.id;
    ctx.session.scheduleViewer.week = timetable.data.week;
    ctx.session.scheduleViewer.groupId = group?.id ?? undefined;
  } catch (e) {
    log.error(`Failed to update timetable msg ${String(e)}`, {
      user: ctx?.from?.id,
    });
    return ctx.answerCbQuery("Произошла ошибка при обновлении.");
  } finally {
    ctx.session.runningScheduleUpdate = false;
  }
}

async function sendGroupSelector(
  ctx: Context,
  groups: { id: number; text: string }[],
) {
  return ctx.reply(
    `Найдены следующие группы:`,
    Markup.inlineKeyboard([
      groups
        .slice(0, 3)
        .map((group) =>
          Markup.button.callback(group.text, `schedule_group_open_${group.id}`),
        ),
      groups
        .slice(3, 6)
        .map((group) =>
          Markup.button.callback(group.text, `schedule_group_open_${group.id}`),
        ),
      groups
        .slice(6, 9)
        .map((group) =>
          Markup.button.callback(group.text, `schedule_group_open_${group.id}`),
        ),
      [Markup.button.callback("Отмена", "schedule_group_open_cancel")],
    ]),
  );
}

export async function initSchedule(bot: Telegraf<Context>) {
  bot.command("schedule", async (ctx) => {
    ctx.session.scheduleViewer = {
      chatId: ctx.chat.id,
      message: 0,
      week: 0,
    };
    const group = /^.* (\d{4}(?:-\d*)?D?)(?: \d+)?$/
      .exec(ctx.message.text)
      ?.at(1);
    const groupIds = group
      ? await findGroupOrOptions({ groupName: group })
      : undefined;
    let groupId: number | undefined = undefined;
    if (group || groupIds) {
      if (
        groupIds === null ||
        (Array.isArray(groupIds) && groupIds.length === 0)
      ) {
        return ctx.reply(`Группа "${group}" не найдена`);
      } else if (Array.isArray(groupIds)) {
        if (groupIds.length === 1) groupId = groupIds[0].id;
        else return sendGroupSelector(ctx, groupIds);
      } else if (groupIds) groupId = groupIds.id;
    }
    const weekArg = /^.* (\d+)(?: .*)?$/.exec(ctx.message.text)?.at(1) ?? "nan";
    let week = 0;
    if (weekArg && !Number.isNaN(Number(weekArg.trim())))
      week = Number(weekArg);
    sendTimetable(ctx, week, groupId ?? undefined).catch((e) => {
      return handleError(ctx, e as Error);
    });
  });

  bot.action(/schedule_button_view_(\d+)\/(\d+)(\/force)?/, async (ctx) => {
    const match = ctx.match;
    if (!match || match.length < 2) return ctx.answerCbQuery("Ошибка");
    const groupId = Number(match[1]);
    const week = Number(match[2]);
    const forceUpdate = Boolean(match[3]);
    if (Number.isNaN(week) || Number.isNaN(groupId)) {
      log.warn(`Invalid view request: ${ctx.match.join()}`, {
        user: ctx.from.id,
      });
      return ctx.answerCbQuery("Ошибка: Неверный запрос");
    }
    updateTimetable(ctx, week, groupId || undefined, { forceUpdate }).catch(
      (e) => {
        return handleError(ctx, e as Error);
      },
    );
  });

  bot.action("open_options", (ctx) => {
    if (ctx.chat?.type !== "private") {
      return ctx.reply("Настройки доступны только в личном чате");
    }
    return openSettings(ctx);
  });

  bot.command("today", async (ctx) => {
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(
        "Вы не найдены в базе данных. Пожалуйста пропишите /start",
      );
    }
    const now = new Date();
    const timetable = await schedule.getWeekTimetable(user, 0);
    const day = timetable.days.at(now.getDay() - 1);
    if (!day?.lessons.length || now.getDay() === 0) {
      return ctx.reply("Сегодня занятий нет :D");
    }
    return ctx.reply(
      `\
Занятия сегодня:

${day.lessons.map(generateTextLesson).join("\n=====\n")}
`,
      { link_preview_options: { is_disabled: true } },
    );
  });

  bot.command("now", async (ctx) => {
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(
        "Вы не найдены в базе данных. Пожалуйста пропишите /start",
      );
    }
    const now = new Date();
    const timetable = await schedule.getWeekTimetable(user, 0);
    const day = timetable.days.at(now.getDay() - 1);
    if (!day?.lessons.length || now.getDay() === 0) {
      return ctx.reply("Сегодня занятий нет :D");
    }
    const lesson = day.lessons.find((l) => l.endTime > now);
    if (!lesson) {
      return ctx.reply("На сегодня занятия закончились :D");
    }
    return ctx.reply(
      `\
${lesson.beginTime > now ? "Сейчас будет:" : "Сейчас идёт:"}

${generateTextLesson(lesson)}
`,
      { link_preview_options: { is_disabled: true } },
    );
  });

  // 0 - 99 as a week number
  bot.hears(/^\d\d?$/, async (ctx) => {
    if (ctx.chat?.type !== "private") {
      return;
    }
    const text = ctx.message.text.trim();
    const week = parseInt(text);
    void ctx.deleteMessage(ctx.message.message_id).catch(() => {
      /* ignore */
    });
    if (ctx.session.scheduleViewer.message) {
      return updateTimetable(
        ctx,
        week,
        ctx.session.scheduleViewer.groupId ?? undefined,
      );
    }
    return sendTimetable(ctx, week);
  });

  // 6101(-090301)?D? as a group number
  bot.hears(/^\d{4}(?:-\d*)?D?$/, async (ctx) => {
    if (ctx.chat?.type !== "private") {
      return;
    }
    const groups = await findGroupOrOptions({
      groupName: ctx.message.text.trim(),
    });
    if (!groups || (Array.isArray(groups) && groups.length === 0)) {
      return ctx.reply("Группа или похожие на неё группы не найдены");
    }
    if (Array.isArray(groups)) {
      if (groups.length === 1) {
        return sendTimetable(ctx, 0, groups[0].id);
      } else {
        return sendGroupSelector(ctx, groups);
      }
    }
    return sendTimetable(ctx, 0, groups.id);
  });

  bot.action(/schedule_group_open_(\d+)/, async (ctx) => {
    const match = ctx.match;
    if (!match || match.length < 2) return ctx.answerCbQuery("Ошибка");
    const groupId = Number(match[1]);
    if (Number.isNaN(groupId) || groupId <= 0)
      return ctx.answerCbQuery("Ошибка");
    void ctx.deleteMessage().catch(() => {
      /* ignore */
    });
    return sendTimetable(ctx, 0, groupId);
  });

  bot.action("schedule_group_open_cancel", async (ctx) => {
    void ctx.deleteMessage().catch(() => {
      /* ignore */
    });
  });
}
