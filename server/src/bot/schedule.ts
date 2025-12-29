import { InlineKeyboard, InputFile, type Bot } from "grammy";
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
import type { User } from "@prisma/client";
import { CommandGroup } from "@grammyjs/commands";
import { getUserIcsByUserId } from "../lib/ics";

async function sendGroupTimetable(
  ctx: Context,
  week: number,
  opts?: { forceUpdate?: boolean },
) {
  if (!ctx.chat || !ctx.from) return;
  if (ctx.session.runningScheduleUpdate) {
    return ctx.answerCallbackQuery(
      "Обновление уже запущено, пожалуйста подождите.",
    );
  }
  ctx.session.runningScheduleUpdate = true;
  const groupChat = await db.groupChat.findUnique({
    where: { tgId: ctx.chat.id },
    include: { user: true },
  });

  if (!groupChat) {
    return ctx.reply(
      `Этот чат не зарегистрирован для получения расписаний. Администратор чата должен быть зарегистрирован в боте и использовать команду /options@${ctx.me.username} в этом чате.`,
    );
  }
  if (!groupChat.groupId) {
    return ctx.reply(
      `В этом чате не закреплена группа. Администратор чата должен закрепить группу через /options@${ctx.me.username}.`,
    );
  }
  if (!groupChat.user) {
    return ctx.reply(
      `Ответственный за обновления не назначен. Администратор чата должен назначить себя ответственным через /options@${ctx.me.username}.`,
    );
  }

  log.debug(`User requested group#${groupChat.id} schedule`, {
    user: ctx.from.id,
  });

  try {
    return sendTimetable(ctx, groupChat.user, week, groupChat.groupId, opts);
  } finally {
    ctx.session.runningScheduleUpdate = false;
  }
}

async function sendTimetable(
  ctx: Context,
  user: User,
  week: number,
  groupId?: number,
  opts?: { forceUpdate?: boolean },
) {
  const isAuthed = await lk.ensureAuth(user);
  const weekNumber = week === 0 ? 0 : Math.min(Math.max(week, 1), 52);
  const preferences = Object.assign(
    {},
    UserPreferencesDefaults,
    user.preferences,
  );

  const group = groupId
    ? await db.group.findUnique({ where: { id: groupId } })
    : null;

  log.debug(
    `[bot] Requested schedule ${preferences.theme}/${groupId ?? user.groupId}/${weekNumber} ${!isAuthed ? "(unauthed) " : ""}`,
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
    clearTimeout(creatingMessageTimeout);
    return ctx.reply(`
Произошла неизвестная ошибка при обновлении.
Попробуйте позже или повторно войдите в аккаунт через /login
Для подробностей свяжитесь с администратором бота.
        `);
  }

  clearTimeout(creatingMessageTimeout);
  if (tempMsgId) {
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, tempMsgId);
    } catch {
      log.warn(`Failed to delete temporary 'creating image' msg`, {
        user: ctx?.from?.id,
      });
    }
  }

  const buttonsMarkup = new InlineKeyboard()
    .text(
      "⬅️",
      `schedule_button_view_${groupId ?? 0}/${timetable.data.week - 1}`,
    )
    .text("🔄", `schedule_button_view_${groupId ?? 0}/${timetable.data.week}`)
    .text(
      "➡️",
      `schedule_button_view_${groupId ?? 0}/${timetable.data.week + 1}`,
    )
    .row();

  if (ctx?.chat?.type === "private") {
    buttonsMarkup.text("⚙️ Настройки", "open_options").row();
  }
  if (
    ctx?.chat?.type === "private" &&
    ctx?.from?.id === env.SCHED_BOT_ADMIN_TGID
  ) {
    buttonsMarkup
      .text(
        "[admin] Обновить насильно",
        `schedule_button_view_${groupId ?? 0}/${week}/force`,
      )
      .row();
  }

  const msg = await ctx.replyWithPhoto(
    timetable.image.tgId ?? new InputFile(timetable.image.data),
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
      reply_markup: buttonsMarkup,
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
}

async function sendUserTimetable(
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
      ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {
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

    if (!groupId && !user.groupId) {
      if (user.authCookie) {
        const infoupd = await lk.updateUserInfo(user);
        if (!infoupd.ok) {
          return ctx.reply(
            "Вы не указали группу в запросе. За вашим пользователем не закреплена группа.\nПри попытке узнать группу через лк произошла ошибка.\nПопробуйте повторно войти в аккаунт через /login",
          );
        } else {
          Object.assign(user, infoupd.data);
          if (!user.groupId) {
            return ctx.reply(
              "Вы не указали группу в запросе. За вашим пользователем не закреплена группа.\nПопробуйте повторно войти в аккаунт через /login",
            );
          }
        }
      } else {
        return ctx.reply(
          'Вы не указали группу в запросе. За вашим пользователем не закреплена группа.\nВойдите в лк через /login, настройте группу через "/config group \'6101-090301D\'" или укажите группу в запросе через "/schedule 6101-090301D"',
        );
      }
    }

    await sendTimetable(ctx, user, week, groupId, opts);
  } catch (e) {
    log.error(`Failed to send timetable ${String(e)}`, { user: ctx?.from?.id });
    return ctx.reply(
      `
Произошла неизвестная ошибка при отправке.
Попробуйте позже или повторно войдите в аккаунт через /login
Для подробностей свяжитесь с администратором бота.
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
    return ctx.answerCallbackQuery(
      "Обновление уже запущено, пожалуйста подождите.",
    );
  }
  if (!ctx.from) return;
  ctx.session.runningScheduleUpdate = true;
  try {
    let userId = ctx.from.id as unknown as bigint;
    if (ctx.chat?.type !== "private") {
      const groupchat = await db.groupChat.findUnique({
        where: { tgId: ctx.chat?.id },
        include: { user: true },
      });
      if (!groupchat?.user) {
        log.warn(
          `Image viewer update requested in group chat with no admin/groupchat`,
        );
        return ctx.answerCallbackQuery(
          "Этот чат не зарегистрирован для получения расписаний или у него нет админа",
        );
      }
      log.debug(
        `Image viewer update requested in group chat ${ctx.chat?.id} as ${groupchat.user.tgId}`,
        { user: ctx.from.id },
      );
      userId = groupchat.user.tgId;
    }
    const chat = ctx.chat;
    const msgId =
      ctx?.callbackQuery?.message?.message_id ??
      ctx.session.scheduleViewer.message;
    if (!msgId || !chat) {
      log.error(`No message ID in callbackQuery`, { user: userId });
      return ctx.answerCallbackQuery(
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

    if (!group && !user.groupId) {
      if (user.authCookie) {
        const infoupd = await lk.updateUserInfo(user);
        if (!infoupd.ok) {
          return ctx.reply(
            "Вы не указали группу в запросе. За вашим пользователем не закреплена группа.\nПри попытке узнать группу через лк произошла ошибка.\nПопробуйте повторно войти в аккаунт через /login или настройте группу через \"/config group '6101-090301D'\"",
          );
        } else {
          Object.assign(user, infoupd.data);
          if (!user.groupId) {
            return ctx.reply(
              "Вы не указали группу в запросе. За вашим пользователем не закреплена группа.\nПопробуйте повторно войти в аккаунт через /login или настройте группу через \"/config group '6101-090301D'\"",
            );
          }
        }
      } else {
        return ctx.reply(
          'Вы не указали группу в запросе. За вашим пользователем не закреплена группа.\nВойдите в лк через /login, настройте группу через "/config group \'6101-090301D\'" или укажите группу в запросе через "/schedule 6101-090301D"',
        );
      }
    }

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
        ctx.api
          .editMessageCaption(chat.id, msgId, {
            caption: "Создание изображения...",
            reply_markup: new InlineKeyboard(),
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
      return ctx.reply(`
Произошла неизвестная ошибка при обновлении.
Попробуйте позже или повторно войдите в аккаунт через /login
Для подробностей свяжитесь с администратором бота.
        `);
    }

    clearTimeout(creatingMessageTimeout);

    if (!timetable.image.tgId) {
      log.debug(`Image had no tgId, will upload new`, { user: userId });
    }

    const buttonsMarkup = new InlineKeyboard()
      .text(
        "⬅️",
        `schedule_button_view_${groupId ?? 0}/${timetable.data.week - 1}`,
      )
      .text("🔄", `schedule_button_view_${groupId ?? 0}/${timetable.data.week}`)
      .text(
        "➡️",
        `schedule_button_view_${groupId ?? 0}/${timetable.data.week + 1}`,
      )
      .row();

    if (ctx?.chat?.type === "private") {
      buttonsMarkup.text("⚙️ Настройки", "open_options").row();
    }
    if (
      ctx?.chat?.type === "private" &&
      ctx?.from?.id === env.SCHED_BOT_ADMIN_TGID
    ) {
      buttonsMarkup
        .text(
          "[admin] Обновить насильно",
          `schedule_button_view_${groupId ?? 0}/${week}/force`,
        )
        .row();
    }

    try {
      await ctx.api.editMessageMedia(
        chat.id,
        msgId,
        {
          type: "photo",
          media: timetable.image.tgId ?? new InputFile(timetable.image.data),
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
        { reply_markup: buttonsMarkup },
      );
    } catch {
      log.debug(`Error: unchanged. Ignoring`, { user: userId });
      await ctx.answerCallbackQuery("Ничего не изменилось");
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
    return ctx.answerCallbackQuery("Произошла ошибка при обновлении.");
  } finally {
    ctx.session.runningScheduleUpdate = false;
  }
}

async function sendGroupSelector(
  ctx: Context,
  groups: { id: number; text: string }[],
) {
  const keyboard = new InlineKeyboard();
  groups.slice(0, 3).forEach((group) => {
    keyboard.text(group.text, `schedule_group_open_${group.id}`);
  });
  keyboard.row();
  groups.slice(3, 6).forEach((group) => {
    keyboard.text(group.text, `schedule_group_open_${group.id}`);
  });
  keyboard.row();
  groups.slice(6, 9).forEach((group) => {
    keyboard.text(group.text, `schedule_group_open_${group.id}`);
  });
  return ctx.reply(`Найдены следующие группы:`, { reply_markup: keyboard });
}

export const scheduleCommands = new CommandGroup<Context>();

export async function initSchedule(bot: Bot<Context>) {
  const commands = scheduleCommands;

  commands.command("schedule", "Расписание", async (ctx) => {
    if (!ctx.from || !ctx.message) return;
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

    if (!groupId && ctx.chat.type !== "private") {
      return sendGroupTimetable(ctx, week);
    }
    sendUserTimetable(ctx, week, groupId ?? undefined).catch((e) => {
      return handleError(ctx, e as Error);
    });
  });

  bot.callbackQuery(
    /schedule_button_view_(\d+)\/(\d+)(\/force)?/,
    async (ctx) => {
      const match = ctx.match;
      if (!match || match.length < 2) return ctx.answerCallbackQuery("Ошибка");
      const groupId = Number(match[1]);
      const week = Number(match[2]);
      const forceUpdate = Boolean(match[3]);
      if (Number.isNaN(week) || Number.isNaN(groupId)) {
        log.warn(
          `Invalid view request: ${typeof ctx.match === "string" ? ctx.match : ctx.match.join()}`,
          {
            user: ctx.from.id,
          },
        );
        return ctx.answerCallbackQuery("Ошибка: Неверный запрос");
      }
      updateTimetable(ctx, week, groupId || undefined, { forceUpdate }).catch(
        (e) => {
          return handleError(ctx, e as Error);
        },
      );
    },
  );

  bot.callbackQuery("open_options", (ctx) => {
    if (ctx.chat?.type !== "private") {
      return ctx.reply("Настройки доступны только в личном чате");
    }
    return openSettings(ctx);
  });

  commands.command(
    "today",
    "Расписание на сегодня (с ссылками на пары)",
    async (ctx) => {
      if (!ctx.from || !ctx.message) return;
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
    },
  );

  commands.command("now", "Ближайшая пара", async (ctx) => {
    if (!ctx.from || !ctx.message) return;
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
    if (!ctx.from || !ctx.message || !ctx.message.text) return;
    if (ctx.chat?.type !== "private") {
      return;
    }
    const text = ctx.message.text.trim();
    const week = parseInt(text);
    void ctx.api
      .deleteMessage(ctx.message.chat.id, ctx.message.message_id)
      .catch(() => {
        /* ignore */
      });
    if (ctx.session.scheduleViewer.message) {
      return updateTimetable(
        ctx,
        week,
        ctx.session.scheduleViewer.groupId ?? undefined,
      );
    }
    return sendUserTimetable(ctx, week);
  });

  // 6101(-090301)?D? as a group number
  bot.hears(/^\d{4}(?:-\d*)?D?$/, async (ctx) => {
    if (!ctx.from || !ctx.message || !ctx.message.text) return;
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
        return sendUserTimetable(ctx, 0, groups[0].id);
      } else {
        return sendGroupSelector(ctx, groups);
      }
    }
    return sendUserTimetable(ctx, 0, groups.id);
  });

  bot.callbackQuery(/schedule_group_open_(\d+)/, async (ctx) => {
    const match = ctx.match;
    if (!match || match.length < 2) return ctx.answerCallbackQuery("Ошибка");
    const groupId = Number(match[1]);
    if (Number.isNaN(groupId) || groupId <= 0)
      return ctx.answerCallbackQuery("Ошибка");
    void ctx.deleteMessage().catch(() => {
      /* ignore */
    });
    return sendUserTimetable(ctx, 0, groupId);
  });

  bot.callbackQuery("schedule_group_open_cancel", async (ctx) => {
    void ctx.deleteMessage().catch(() => {
      /* ignore */
    });
  });

  commands.command("ics", "Ссылка на календарь ics", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (!ctx.from) {
      return ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
        parse_mode: "HTML",
      });
    }
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(
        "Вас не существует в базе данных. Пожалуйста пропишите /start",
      );
    }
    const cal = await getUserIcsByUserId(user.id);
    if (!cal) {
      return ctx.reply(
        `Произошла ошибка при попытке создать календарь.\nПожалуйста попробуйте позже или свяжитесь с администратором бота`,
      );
    }
    return ctx.reply(
      `\
Инструкция по установке: https://l9labs.ru/stud_bot/ics.html
(Украдено у l9 :D)

Ваша ссылка:
https://${env.SCHED_BOT_DOMAIN}/api/v0/ics/${cal.uuid}

‼️Файл по этой ссылке не для скачивания‼️
Содержимое ссылки генерируется динамически в зависимости от текущего расписания и ваших настроек.
Добавьте её в календарь и включите синхронизацию.
 `,
      { link_preview_options: { is_disabled: true } },
    );
  });

  bot.use(commands);
  return commands;
}
