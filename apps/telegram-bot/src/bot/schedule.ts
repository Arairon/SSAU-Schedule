import { InlineKeyboard, type Bot } from "grammy";
import type { Context } from "./types";

import log from "@/logger";
import { formatBigInt } from "@ssau-schedule/shared/utils";
import { getWeekFromDate } from "@ssau-schedule/shared/date";
import { env } from "@/env";
import {
  formatTimetableDiff,
  generateTextLesson,
} from "@ssau-schedule/shared/misc";
import { getUserPreferences } from "@ssau-schedule/shared/utils";
import { handleError } from ".";
import { openSettings } from "./options";
import { CommandGroup } from "@grammyjs/commands";
import { uploadScheduleImage } from "./imageUploading";
import { api } from "@/serverClient";
import { getUser } from "./misc";

function answerCallbackQueryOrReply(ctx: Context, text: string) {
  if (ctx.callbackQuery) {
    return ctx.answerCallbackQuery(text);
  }

  if (!ctx.chat) return;
  return ctx.reply(text);
}

function answerCallbackQueryIfPresent(ctx: Context, text?: string) {
  if (!ctx.callbackQuery) return;
  return text ? ctx.answerCallbackQuery(text) : ctx.answerCallbackQuery();
}

// async function sendGroupTimetable(
//   ctx: Context,
//   week: number,
//   opts?: { forceUpdate?: boolean },
// ) {
//   if (!ctx.chat || !ctx.from) return;
//   if (
//     ctx.session.startedScheduleUpdateAt &&
//     Date.now() - ctx.session.startedScheduleUpdateAt.getTime() < 30_000
//   ) {
//     return answerCallbackQueryOrReply(
//       ctx,
//       "Обновление уже запущено, пожалуйста подождите.",
//     );
//   }
//   ctx.session.startedScheduleUpdateAt = new Date();
//   const groupChat = await db.groupChat.findUnique({
//     where: { tgId: ctx.chat.id },
//     include: { user: true },
//   });

//   if (!groupChat) {
//     return ctx.reply(
//       `Этот чат не зарегистрирован для получения расписаний. Администратор чата должен быть зарегистрирован в боте и использовать команду /options@${ctx.me.username} в этом чате.`,
//     );
//   }
//   if (!groupChat.groupId) {
//     return ctx.reply(
//       `В этом чате не закреплена группа. Администратор чата должен закрепить группу через /options@${ctx.me.username}.`,
//     );
//   }
//   if (!groupChat.user) {
//     return ctx.reply(
//       `Ответственный за обновления не назначен. Администратор чата должен назначить себя ответственным через /options@${ctx.me.username}.`,
//     );
//   }

//   log.debug(`User requested group#${groupChat.id} schedule`, {
//     user: ctx.from.id,
//   });

//   try {
//     return sendTimetable(ctx, groupChat.user, week, groupChat.groupId, opts);
//   } finally {
//     ctx.session.startedScheduleUpdateAt = null;
//   }
// }

type User = {
  id: number;
  tgId: bigint;
  groupId: number | null;
  authCookie: boolean;
  preferences: object;
};

async function sendTimetable(
  ctx: Context,
  user: User,
  week: number,
  groupId?: number,
  opts?: { forceUpdate?: boolean },
) {
  const isAuthed = user.authCookie;
  let weekNumber = week === 0 ? 0 : Math.min(Math.max(week, 1), 52);
  const now = new Date();
  const currentWeek = getWeekFromDate(now);
  if (weekNumber === 0 && now.getDay() === 0) {
    weekNumber = currentWeek + 1;
  }
  const preferences = getUserPreferences(user);

  const group = groupId
    ? await api.group
        .id({ id: groupId })
        .get()
        .then((res) => res.data)
        .catch(() => null)
    : null;

  log.debug(
    `[bot] Requested schedule ${preferences.theme}/${groupId ?? user.groupId}/${weekNumber} ${!isAuthed ? "(unauthed) " : ""}`,
    { user: ctx?.from?.id },
  );
  const startTime = process.hrtime.bigint();

  let tempMsgId: number | null = null;
  let tempMsgPromise: Promise<unknown> | null = null;

  function updateTempMsg(text: string) {
    if (!text) return;

    function requestUpdate(): Promise<unknown> {
      if (!tempMsgId) {
        return ctx
          .reply(text ?? "Загрузка...")
          .then((m) => {
            tempMsgId = m.message_id;
          })
          .catch();
      } else {
        return ctx.api.editMessageText(ctx.chat!.id, tempMsgId, text).catch();
      }
    }

    if (tempMsgPromise) {
      tempMsgPromise = tempMsgPromise.then(() => requestUpdate());
    } else {
      tempMsgPromise = requestUpdate();
    }
  }

  let data;
  // let error = "";

  try {
    data = await api.schedule.image
      .get({
        query: {
          userId: user.id,
          week: weekNumber,
          groupId: group?.id ?? undefined,
          stylemap: preferences.theme,
          forceUpdate: !!opts?.forceUpdate,
        },
      })
      .then((res) => res.data);
    // data = await schedule.getTimetableWithImage(user, weekNumber, {
    //   groupId: group?.id ?? undefined,
    //   stylemap: preferences.theme,
    //   forceUpdate: opts?.forceUpdate ?? undefined,
    //   onUpdate: ({ state, message }) => {
    //     let text = "";
    //     switch (state) {
    //       case "updatingWeek":
    //         text = "Обновление расписания...";
    //         break;
    //       case "generatingTimetable":
    //         // text = "Генерация расписания...";
    //         // ignored
    //         break;
    //       case "generatingImage":
    //         text = "Создание изображения...";
    //         break;
    //       case "error":
    //         error = message ?? "Произошла ошибка при получении расписания.";
    //         return; // prevent updateTempMsg
    //     }
    //     updateTempMsg(text);
    //   },
    // });
    if (!data) throw new Error("No data received from API");
  } catch (e) {
    log.error(`Failed to get timetable ${String(e)}`, {
      user: ctx?.from?.id,
    });
    return ctx.reply(`
Произошла неизвестная ошибка при обновлении.
Есть ненулевой шанс, что изображение не может быть отправленно из-за определённой трехбуквенной конторы...
Для подробностей свяжитесь с администратором бота.
        `);
  }
  const { timetable, image } = data;

  const buttonsMarkup = new InlineKeyboard()
    .text("⬅️", `schedule_button_view_${groupId ?? 0}/${timetable.week - 1}`)
    .text("🔄", `schedule_button_view_${groupId ?? 0}/${timetable.week}`)
    .text("➡️", `schedule_button_view_${groupId ?? 0}/${timetable.week + 1}`)
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

  let weekNumberModifier = "";
  if (timetable.week === currentWeek) weekNumberModifier = " (текущая)";
  else if (timetable.week === currentWeek + 1)
    weekNumberModifier = " (следующая)";
  else if (timetable.week === currentWeek - 1)
    weekNumberModifier = " (предыдущая)";

  const caption =
    `Расписание на ${timetable.week} неделю` +
    weekNumberModifier +
    (group ? `\nДля группы ${group.name}` : "") +
    // (error ? `\n${error}` : "") +
    (timetable.diff
      ? `\nОбнаружены изменения в расписании!\n${formatTimetableDiff(timetable.diff, "short", 8)}`
      : "");

  const sendPhoto = (media: string) =>
    ctx.replyWithPhoto(media, {
      caption,
      reply_markup: buttonsMarkup,
    });

  let msg: Awaited<ReturnType<typeof ctx.replyWithPhoto>>;
  let uploadedFileId: string | null = null;
  if (image.tgId) {
    log.debug("Image has tgId, sending by tgId", { user: ctx?.from?.id });
    msg = await sendPhoto(image.tgId);
  } else {
    log.debug("Image has no tgId, will upload new", { user: ctx?.from?.id });

    // TODO: Remove "blame on RKN" when the image uploading is no longer fucked
    updateTempMsg(
      `Отправка изображения...\n(это может занять некоторое время, пожалуйста подождите. Во всём винить РКН)`,
    );

    const uploaded = await uploadScheduleImage({
      api: ctx.api,
      image: {
        ...image,
        data: Buffer.from(image.data, "base64"),
      },
      caption: `requested by ${ctx?.from?.id ?? "???"} for #${timetable.weekId}\n${image.timetableHash}/${image.stylemap} (sent new)`,
      userId: ctx?.from?.id,
      onFallbackAttempt: () => {
        updateTempMsg(
          `Произошла ошибка при отправке. Пробуем другим способом...\n(это может занять некоторое время, пожалуйста подождите. Во всём винить РКН)`,
        );
      },
    });

    uploadedFileId = uploaded.fileId;
    msg = await sendPhoto(uploaded.fileId);
  }

  if (!image.tgId && uploadedFileId) {
    log.debug(`Image had no tgId, uploaded new ${uploadedFileId}`, {
      user: ctx?.from?.id,
    });
  }

  if (tempMsgId) {
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, tempMsgId);
    } catch {
      log.warn(`Failed to delete temporary 'creating image' msg`, {
        user: ctx?.from?.id,
      });
    }
  }
  const endTime = process.hrtime.bigint();
  log.debug(
    `[bot] Image viewer ${image.stylemap}/${timetable.groupId}/${timetable.week}. Took ${formatBigInt(endTime - startTime)}ns`,
    { user: ctx?.from?.id },
  );
  ctx.session.scheduleViewer.message = msg.message_id;
  ctx.session.scheduleViewer.chatId = msg.chat.id;
  ctx.session.scheduleViewer.week = timetable.week;
  ctx.session.scheduleViewer.groupId = group?.id ?? undefined;
}

async function sendUserTimetable(
  ctx: Context,
  week: number,
  groupId?: number,
  opts?: { forceUpdate?: boolean },
) {
  if (
    ctx.session.startedScheduleUpdateAt &&
    Date.now() - ctx.session.startedScheduleUpdateAt.getTime() < 30_000
  ) {
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
  ctx.session.startedScheduleUpdateAt = new Date();
  try {
    const user = await getUser(ctx, { required: true });
    if (!user) return; // getUser уже отправил сообщение об ошибке

    if (!groupId && !user.groupId) {
      return ctx.reply(
        'Вы не указали группу в запросе. За вашим пользователем не закреплена группа.\nНастройте группу через /options или укажите группу в запросе через "/schedule 6101-090301D"',
      );
    }

    await sendTimetable(ctx, user as unknown as User, week, groupId, opts);
  } catch (e) {
    log.error(`Failed to send timetable ${String(e)}`, { user: ctx?.from?.id });
    return ctx.reply(
      `
Произошла неизвестная ошибка при отправке.
Есть ненулевой шанс, что изображение не может быть отправленно из-за определённой трехбуквенной конторы...
Для подробностей свяжитесь с администратором бота.
        `,
    );
  } finally {
    ctx.session.startedScheduleUpdateAt = null;
  }
}

export async function updateTimetable(
  ctx: Context,
  week: number,
  groupId?: number,
  opts?: { forceUpdate?: boolean },
) {
  if (
    ctx.session.startedScheduleUpdateAt &&
    Date.now() - ctx.session.startedScheduleUpdateAt.getTime() < 30_000
  ) {
    return answerCallbackQueryOrReply(
      ctx,
      "Обновление уже запущено, пожалуйста подождите.",
    );
  }
  if (!ctx.from) return;
  ctx.session.startedScheduleUpdateAt = new Date();
  try {
    const userId = ctx.from.id; // let
    if (ctx.chat?.type !== "private") {
      return ctx.reply(`Групповые чаты временно недоступны.`);
      // const groupchat = await db.groupChat.findUnique({
      //   where: { tgId: ctx.chat?.id },
      //   include: { user: true },
      // });
      // if (!groupchat?.user) {
      //   log.warn(
      //     `Image viewer update requested in group chat with no admin/groupchat`,
      //   );
      //   return answerCallbackQueryOrReply(
      //     ctx,
      //     "Этот чат не зарегистрирован для получения расписаний или у него нет админа",
      //   );
      // }
      // log.debug(
      //   `Image viewer update requested in group chat ${ctx.chat?.id} as ${groupchat.user.tgId}`,
      //   { user: ctx.from.id },
      // );
      // userId = groupchat.user.tgId;
    }
    const chat = ctx.chat;
    const msgId =
      ctx?.callbackQuery?.message?.message_id ??
      ctx.session.scheduleViewer.message;
    if (!msgId || !chat) {
      log.error(`No message ID in callbackQuery`, { user: userId });
      return answerCallbackQueryOrReply(
        ctx,
        "Произошла ошибка, пожалуйста используйте /schedule.",
      );
    }
    const user = await api.user
      .tgid({ id: userId })
      .get()
      .then((res) => res.data);
    if (!user) {
      return ctx.reply(
        "Вы не найдены в базе данных. Пожалуйста пропишите /start",
      );
    }
    const isAuthed = !!user.authCookie;
    const weekNumber = week === 0 ? 0 : Math.min(Math.max(week, 1), 52);
    const group = groupId
      ? await api.group
          .id({ id: groupId })
          .get()
          .then((res) => res.data)
      : null;
    if (!groupId && !user.groupId) {
      await answerCallbackQueryIfPresent(ctx)?.catch(() => undefined);
      return ctx.reply(
        'Вы не указали группу в запросе. За вашим пользователем не закреплена группа.\nНастройте группу через /options или укажите группу в запросе через "/schedule 6101-090301D"',
      );
    }

    const preferences = getUserPreferences(user);

    log.debug(
      `[bot.viewer] Requested schedule ${preferences.theme}/${groupId}/${weekNumber} ${!isAuthed ? "(unauthed) " : ""}`,
      { user: userId },
    );
    const startTime = process.hrtime.bigint();

    let tempMsgPromise: Promise<unknown> | null = null;

    function updateTempMsg(text: string) {
      if (!text) return;

      function requestUpdate(): Promise<unknown> {
        return ctx.api
          .editMessageCaption(chat.id, msgId, {
            caption: text,
            reply_markup: new InlineKeyboard(),
          })
          .catch();
      }

      if (tempMsgPromise) {
        tempMsgPromise = tempMsgPromise.then(() => requestUpdate());
      } else {
        tempMsgPromise = requestUpdate();
      }
    }

    let data;
    // let error = "";
    try {
      data = await api.schedule.image
        .get({
          query: {
            userId: user.id,
            week: weekNumber,
            groupId: group?.id ?? undefined,
            stylemap: preferences.theme,
            forceUpdate: !!opts?.forceUpdate,
          },
        })
        .then((res) => res.data);
      if (!data) throw new Error("No data received from API");
      // data = await schedule.getTimetableWithImage(user, weekNumber, {
      //   groupId: group?.id ?? undefined,
      //   stylemap: preferences.theme,
      //   forceUpdate: opts?.forceUpdate ?? undefined,
      //   onUpdate: ({ state, message }) => {
      //     let text = "";
      //     switch (state) {
      //       case "updatingWeek":
      //         text = "Обновление расписания...";
      //         break;
      //       case "generatingTimetable":
      //         // text = "Генерация расписания...";
      //         // ignored
      //         break;
      //       case "generatingImage":
      //         // text = "Создание изображения...";
      //         // ignored
      //         break;
      //       case "error":
      //         error = message ?? "Произошла ошибка при получении расписания.";
      //         return; // prevent updateTempMsg
      //     }
      //     updateTempMsg(text);
      //   },
      // });
    } catch (e) {
      log.error(`Failed to get timetable ${String(e)}`, { user: userId });
      return ctx.reply(`
Произошла неизвестная ошибка при обновлении.
Есть ненулевой шанс, что изображение не может быть отправленно из-за определённой трехбуквенной конторы...
Для подробностей свяжитесь с администратором бота.
        `);
    }
    const { timetable, image } = data;

    const buttonsMarkup = new InlineKeyboard()
      .text("⬅️", `schedule_button_view_${groupId ?? 0}/${timetable.week - 1}`)
      .text("🔄", `schedule_button_view_${groupId ?? 0}/${timetable.week}`)
      .text("➡️", `schedule_button_view_${groupId ?? 0}/${timetable.week + 1}`)
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
      const currentWeek = getWeekFromDate(new Date());
      let weekNumberModifier = "";
      if (timetable.week === currentWeek) weekNumberModifier = " (текущая)";
      else if (timetable.week === currentWeek + 1)
        weekNumberModifier = " (следующая)";
      else if (timetable.week === currentWeek - 1)
        weekNumberModifier = " (предыдущая)";

      let caption =
        `Расписание на ${timetable.week} неделю` +
        weekNumberModifier +
        (group ? `\nДля группы ${group.name}` : "") +
        // (error ? `\n${error}` : "") +
        (timetable.diff
          ? `\nОбнаружены изменения в расписании!\n${formatTimetableDiff(timetable.diff, "short", 8)}`
          : "");
      if (caption.length > 1024) {
        caption = caption.slice(0, 1020) + " ...";
      }

      const editPhoto = (media: string) =>
        ctx.api.editMessageMedia(
          chat.id,
          msgId,
          {
            type: "photo",
            media,
            caption,
          },
          { reply_markup: buttonsMarkup },
        );

      if (image.tgId) {
        log.debug("Image has tgId, sending by tgId", { user: userId });
        await editPhoto(image.tgId);
      } else {
        log.debug("Image has no tgId, will upload new", { user: userId });

        updateTempMsg(
          `Отправка изображения...\n(это может занять некоторое время, пожалуйста подождите. Во всём винить РКН)`,
        );

        const uploaded = await uploadScheduleImage({
          api: ctx.api,
          image: {
            ...image,
            data: Buffer.from(image.data, "base64"),
          },
          caption: `requested by ${userId} for #${timetable.weekId}\n${image.timetableHash}/${image.stylemap}  (upd)`,
          userId,
          onFallbackAttempt: () => {
            updateTempMsg(
              `Произошла ошибка при отправке. Пробуем другим способом...\n(это может занять некоторое время, пожалуйста подождите. Во всём винить РКН)`,
            );
          },
        });

        await editPhoto(uploaded.fileId);
      }
    } catch (error) {
      log.debug(
        `Error: unchanged or errored. Ignoring. Err: ${JSON.stringify(error)}`,
        { user: userId },
      );
      await answerCallbackQueryOrReply(ctx, "Ничего не изменилось");
    }
    const endTime = process.hrtime.bigint();
    log.debug(
      `[bot] Image viewer update ${image.stylemap}/${timetable.groupId}/${timetable.week}. Took ${formatBigInt(endTime - startTime)}ns`,
      { user: userId },
    );

    ctx.session.scheduleViewer.message = msgId;
    ctx.session.scheduleViewer.chatId = chat.id;
    ctx.session.scheduleViewer.week = timetable.week;
    ctx.session.scheduleViewer.groupId = group?.id ?? undefined;
  } catch (e) {
    log.error(`Failed to update timetable msg ${String(e)}`, {
      user: ctx?.from?.id,
    });
    return answerCallbackQueryOrReply(ctx, "Произошла ошибка при обновлении.");
  } finally {
    ctx.session.startedScheduleUpdateAt = null;
  }
}

async function sendGroupSelector(
  ctx: Context,
  groups: { id: number; name: string }[],
) {
  const keyboard = new InlineKeyboard();
  groups.slice(0, 3).forEach((group) => {
    keyboard.text(group.name, `schedule_group_open_${group.id}`);
  });
  keyboard.row();
  groups.slice(3, 6).forEach((group) => {
    keyboard.text(group.name, `schedule_group_open_${group.id}`);
  });
  keyboard.row();
  groups.slice(6, 9).forEach((group) => {
    keyboard.text(group.name, `schedule_group_open_${group.id}`);
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
      ? await api.ssau.findGroupOrOptions
          .get({ query: { name: group } })
          .then((res) => res.data)
          .catch(() => null)
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
      }
    }
    const weekArg = /^.* (\d+)(?: .*)?$/.exec(ctx.message.text)?.at(1) ?? "nan";
    let week = 0;
    if (weekArg && !Number.isNaN(Number(weekArg.trim())))
      week = Number(weekArg);

    // if (!groupId && ctx.chat.type !== "private") {
    //   return sendGroupTimetable(ctx, week);
    // }
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
    void ctx.answerCallbackQuery();
    return openSettings(ctx);
  });

  commands.command(
    "today",
    "Расписание на сегодня (с ссылками на пары)",
    async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      const user = await getUser(ctx, { required: true });
      if (!user) return;
      const now = new Date();
      const timetable = (await api.schedule.json
        .get({ query: { userId: user.id, week: 0 } })
        .then((res) => res.data))!;
      const day = timetable.days.at(now.getDay() - 1);

      if (
        ctx.message.text.split(" ")[1] === "admin" &&
        ctx.from.id === env.SCHED_BOT_ADMIN_TGID
      ) {
        return ctx.reply(JSON.stringify(day, undefined, 2), {
          link_preview_options: { is_disabled: true },
        });
      }

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
    const user = await getUser(ctx, { required: true });
    if (!user) return;
    const now = new Date();
    const timetable = (await api.schedule.json
      .get({ query: { userId: user.id, week: 0 } })
      .then((res) => res.data))!;
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
      .catch();
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
    const groups = await api.ssau.findGroupOrOptions
      .get({ query: { name: ctx.message.text.trim() } })
      .then((res) => res.data)
      .catch(() => null);
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
    const user = await getUser(ctx, { required: true });
    if (!user) return;
    const cal = await api.user
      .id({ id: user.id })
      .ics.get()
      .then((res) => res.data)
      .catch(() => null);
    if (!cal) {
      return ctx.reply(
        `Произошла ошибка при попытке создать календарь.\nПожалуйста попробуйте позже или свяжитесь с администратором бота`,
      );
    }
    return ctx.reply(
      `\
Ваша ссылка:
https://${env.SCHED_SERVER_DOMAIN}/api/v0/ics/${cal.uuid}

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
