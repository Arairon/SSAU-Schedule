import { InlineKeyboard, type Bot } from "grammy";
import { CommandGroup } from "@grammyjs/commands";
import { type Context } from "./types";
import log from "../logger";
import { db } from "../db";
import { UserPreferencesDefaults } from "../lib/misc";
import { STYLEMAPS } from "../lib/scheduleImage";
import { env } from "../env";
import {
  getCurrentYearId,
  getWeekFromDate,
} from "@shared/date";
import {
  getPersonShortname,
} from "../lib/utils"
import {
  invalidateDailyNotificationsForTarget,
  scheduleDailyNotificationsForUser,
} from "../lib/tasks";
import { type User } from "@prisma/client";

// function getCurrentOptionsText(user: User) {
//   const preferences = Object.assign(
//     {},
//     UserPreferencesDefaults,
//     user.preferences,
//   );
//   return fmt`
// Тема: ${STYLEMAPS[preferences.theme ?? "default"].description}
// Подгруппа: ${user.subgroup || "Обе"}
// Отображать ИОТы: ${preferences.showIet ? "Да" : "Нет"}
// Отображать Военку: ${preferences.showMilitary ? "Да" : "Нет"}
//   `;
// }

const menuText: Record<string, string> = {
  "": "",
  themes: "Выберите новую тему",
  subgroup: "Выберите подгруппу",
  notifications: "Уведомления (Применяются только со следующего дня)",
  notifications_daystart:
    "Чтобы установить произвольное время используйте\n/config notify daystart [строка]\nПример строки: 1h 30m 30s",
  groupchat: "Настройки группового чата (Только для администраторов)",
  groupchat_deregister: "Вы уверены что хотите отключить чат от бота?",
  groupchat_changeowner: "Вы уверены что хотите перенять админство расписания?",
};

async function updateOptionsMsg(ctx: Context) {
  if (ctx.session.options.message === 0) {
    ctx.session.options.message = (await ctx.reply("Настройки")).message_id;
  }
  const menu = ctx.session.options.menu;
  const chat = ctx.chat?.id;
  if (!chat) {
    return ctx.reply(
      "Произошла ошибка. Вы находитесь в несуществующем чате.\n(Я понятия не имею как это возможно)",
    );
  }
  const msgId = ctx.session.options.message;
  const user = await db.user.findUnique({
    where: { tgId: ctx.from?.id ?? ctx.callbackQuery?.from.id },
  });
  if (!user) {
    return ctx.reply(`Вас нет в базе данных, пожалуйста пропишите /start`);
  }
  const preferences = Object.assign(
    {},
    UserPreferencesDefaults,
    user.preferences,
  );
  const newText = `Настройки\n==============================\n${(ctx.session.options.updText ?? "") || menuText[menu] || ""}`;
  ctx.session.options.updText = null;
  switch (menu) {
    case "": {
      const theme =
        STYLEMAPS[preferences.theme ?? "default"] ?? STYLEMAPS.default;
      return ctx.api
        .editMessageText(chat, msgId, newText, {
          reply_markup: new InlineKeyboard()
            .text(`Тема: ${theme.description}`, "options_themes")
            .row()
            .text(
              `Подгруппа: ${(user.subgroup ?? 0) || "Обе"}`,
              "options_subgroup",
            )
            .row()
            .text(
              `ИОТы: ${preferences.showIet ? "✅" : "❌"}`,
              "options_toggle_iet",
            )
            .text(
              `Военка: ${preferences.showMilitary ? "✅" : "❌"}`,
              "options_toggle_military",
            )
            .row()
            .text(`Уведомления`, "options_notifications")
            .row()
            .text(`Закрыть`, "options_close")
            .row(),
        })
        .catch(() => {
          /* ignore */
        });
    }
    case "themes": {
      const keyboard = new InlineKeyboard();
      Object.values(STYLEMAPS).map((theme) =>
        keyboard
          .text(`${theme.description}`, `options_theme_set_${theme.name}`)
          .row(),
      );
      keyboard.text("Назад", "options_menu").row();
      return ctx.api.editMessageText(chat, msgId, newText, {
        reply_markup: keyboard,
      });
    }
    case "subgroup": {
      return ctx.api.editMessageText(chat, msgId, newText, {
        reply_markup: new InlineKeyboard()
          .text("Обе", "options_subgroup_0")
          .row()
          .text("Первая", "options_subgroup_1")
          .row()
          .text("Вторая", "options_subgroup_2")
          .row()
          .text("Назад", "options_menu")
          .row(),
      });
    }
    case "notifications": {
      const notifyBeforeLessonsMinutes = Math.round(
        preferences.notifyBeforeLessons / 60,
      );
      return ctx.api.editMessageText(chat, msgId, newText, {
        reply_markup: new InlineKeyboard()
          .text(
            `Перед началом занятий: ${notifyBeforeLessonsMinutes ? `за ${notifyBeforeLessonsMinutes} мин` : "Выкл"}`,
            "options_notifications_daystart_edit",
          )
          .row()
          .text(
            `О следующей паре: ${preferences.notifyAboutNextLesson ? "✅" : "❌"}`,
            "options_notifications_nextlesson_toggle",
          )
          .row()
          .text(
            `О следующем дне: ${preferences.notifyAboutNextDay ? "✅" : "❌"}`,
            "options_notifications_nextday_toggle",
          )
          .row()
          .text(
            `О следующей неделе: ${preferences.notifyAboutNextWeek ? "✅" : "❌"}`,
            "options_notifications_nextweek_toggle",
          )
          .row()
          .text("Назад", "options_menu")
          .row(),
      });
    }
    case "notifications_daystart": {
      return ctx.api.editMessageText(chat, msgId, newText, {
        reply_markup: new InlineKeyboard()
          .text(`Отключить`, "options_notifications_daystart_set_0")
          .row()
          .text(`15 мин`, "options_notifications_daystart_set_15")
          .text(`30 мин`, "options_notifications_daystart_set_30")
          .text(`45 мин`, "options_notifications_daystart_set_45")
          .row()
          .text(`1 час`, "options_notifications_daystart_set_60")
          .text(`1.5 часа`, "options_notifications_daystart_set_90")
          .text(`2 часа`, "options_notifications_daystart_set_120")
          .row()
          .text(`2.5 часа`, "options_notifications_daystart_set_150")
          .text(`3 часа`, "options_notifications_daystart_set_180")
          .text(`4 часа`, "options_notifications_daystart_set_240")
          .row()
          .text("Назад", "options_notifications")
          .row(),
      });
    }
    case "groupchat": {
      const groupchat = await db.groupChat.findUnique({
        where: { tgId: chat },
        include: { group: true, user: true },
      });
      if (!groupchat) {
        return ctx.api.editMessageText(chat, msgId, newText, {
          reply_markup: new InlineKeyboard()
            .text("Зарегистрировать чат", "options_groupchat_register")
            .row()
            .text("Закрыть", "options_groupchat_close"),
        });
      }
      return ctx.api.editMessageText(chat, msgId, newText, {
        reply_markup: new InlineKeyboard()
          .text(
            `Группа: ${groupchat.group?.name ?? "Отсутствует"}`,
            "options_groupchat_changegroup",
          )
          .row()
          .text(
            `Админ: ${(groupchat.user?.fullname ? getPersonShortname(groupchat.user.fullname) : groupchat.user?.id) ?? "Отсутствует"}`,
            "options_groupchat_changeowner",
          )
          .row()
          .text("Отключить чат", "options_groupchat_deregister")
          .row()
          .text("Закрыть", "options_groupchat_close"),
      });
    }
    case "groupchat_deregister": {
      return ctx.api.editMessageText(chat, msgId, newText, {
        reply_markup: new InlineKeyboard()
          .text("Да, отключить", "options_groupchat_deregister_confirm")
          .row()
          .text("Назад", "options_groupchat_menu"),
      });
    }
    case "groupchat_changeowner": {
      return ctx.api.editMessageText(chat, msgId, newText, {
        reply_markup: new InlineKeyboard()
          .text("Перенять группу", "groupchat_changeowner_confirm")
          .row()
          .text("Назад", "options_groupchat_menu"),
      });
    }
    default: {
      return ctx.answerCallbackQuery(
        "Прозошла ошибка: Переход в несуществующее меню",
      );
    }
  }
}

export async function openSettings(ctx: Context, menu?: string) {
  if (ctx.session.options.message)
    void ctx.api.deleteMessage(ctx.chat!.id, ctx.session.options.message);
  ctx.session.options = {
    message: 0,
    menu: menu ?? "",
    updText: null,
    notificationsRescheduleTimeout: null,
  };
  return updateOptionsMsg(ctx);
}

function scheduleUserNotificationsUpdate(ctx: Context, user: User) {
  if (ctx.session.options.notificationsRescheduleTimeout) {
    clearTimeout(ctx.session.options.notificationsRescheduleTimeout);
  }
  const chat = ctx.chat;
  const from = ctx.from;
  if (!chat || !from || !user.groupId) return;
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  ctx.session.options.notificationsRescheduleTimeout = setTimeout(async () => {
    const now = new Date();
    const year = getCurrentYearId();
    const weekNumber = getWeekFromDate(now) + (now.getDay() === 0 ? 1 : 0);
    const week = await db.week.findUnique({
      where: {
        owner_groupId_year_number: {
          owner: user.id,
          groupId: user.groupId!,
          year,
          number: weekNumber,
        },
      },
    });
    if (!week) return;
    log.debug("Rescheduling notifications after options change", {
      user: user.tgId,
    });
    await invalidateDailyNotificationsForTarget(user.tgId.toString());
    await scheduleDailyNotificationsForUser(user, week.number);
  }, 30_000);
}

async function initGroupchatOptions(bot: Bot<Context>) {
  bot.callbackQuery("options_groupchat_register", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) {
      const member = await ctx.api.getChatMember(ctx.chat!.id, ctx.from.id);
      if (member.status !== "administrator" && member.status !== "creator") {
        return ctx.answerCallbackQuery(
          "Только администраторы могут использовать эти настройки",
        );
      }
    }
    const chat = ctx.chat;
    if (!chat) return;
    const existing = await db.groupChat.findUnique({
      where: { tgId: chat.id },
    });
    if (existing) return ctx.answerCallbackQuery("Чат уже зарегистрирован");
    const user = await db.user.findUnique({
      where: { tgId: ctx.from.id },
      include: { group: true },
    });
    await db.groupChat.create({
      data: {
        tgId: chat.id,
        userId: user?.id ?? undefined,
        groupId: user?.groupId ?? undefined,
      },
    });

    ctx.session.options.updText = `Чат успешно зарегистрирован${user?.group ? ` с группой '${user.group.name}'` : ``}`;
    ctx.session.options.menu = "groupchat";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_groupchat_deregister", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) {
      const member = await ctx.api.getChatMember(ctx.chat!.id, ctx.from.id);
      if (member.status !== "administrator" && member.status !== "creator") {
        return ctx.answerCallbackQuery(
          "Только администраторы могут использовать эти настройки",
        );
      }
    }

    ctx.session.options.menu = "groupchat_deregister";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_groupchat_deregister_confirm", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) {
      const member = await ctx.api.getChatMember(ctx.chat!.id, ctx.from.id);
      if (member.status !== "administrator" && member.status !== "creator") {
        return ctx.answerCallbackQuery(
          "Только администраторы могут использовать эти настройки",
        );
      }
    }
    const chat = ctx.chat;
    if (!chat) return;
    const groupchat = await db.groupChat.findUnique({
      where: { tgId: chat.id },
    });
    if (!groupchat) return ctx.answerCallbackQuery("Чат не зарегистрирован");

    await db.groupChat.delete({ where: { id: groupchat.id } });

    ctx.session.options.updText = `Чат успешно отключен от бота`;
    ctx.session.options.menu = "groupchat";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_groupchat_changegroup", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) {
      const member = await ctx.api.getChatMember(ctx.chat!.id, ctx.from.id);
      if (member.status !== "administrator" && member.status !== "creator") {
        return ctx.answerCallbackQuery(
          "Только администраторы могут использовать эти настройки",
        );
      }
    }

    return ctx.answerCallbackQuery("На данный момент эта функция недоступна");
  });

  bot.callbackQuery("options_groupchat_changeowner", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) {
      const member = await ctx.api.getChatMember(ctx.chat!.id, ctx.from.id);
      if (member.status !== "administrator" && member.status !== "creator") {
        return ctx.answerCallbackQuery(
          "Только администраторы могут использовать эти настройки",
        );
      }
    }

    ctx.session.options.menu = "groupchat_changeowner";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("groupchat_changeowner_confirm", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) {
      const member = await ctx.api.getChatMember(ctx.chat!.id, ctx.from.id);
      if (member.status !== "administrator" && member.status !== "creator") {
        return ctx.answerCallbackQuery(
          "Только администраторы могут использовать эти настройки",
        );
      }
    }

    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user)
      return ctx.answerCallbackQuery(
        "Вас нет в базе данных, пожалуйста пропишите /start в ЛС с ботом",
      );
    const chat = ctx.chat;
    if (!chat) return;
    const groupchat = await db.groupChat.findUnique({
      where: { tgId: chat.id },
    });
    if (!groupchat) return ctx.answerCallbackQuery("Чат не зарегистрирован");
    if (groupchat.userId === user.id)
      return ctx.answerCallbackQuery(
        "Вы уже являетесь администратором этого чата",
      );

    await db.groupChat.update({
      where: { id: groupchat.id },
      data: { userId: user.id },
    });

    ctx.session.options.updText = `Вы успешно переняли админство расписания`;
    ctx.session.options.menu = "groupchat";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_groupchat_menu", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) {
      const member = await ctx.api.getChatMember(ctx.chat!.id, ctx.from.id);
      if (member.status !== "administrator" && member.status !== "creator") {
        return ctx.answerCallbackQuery(
          "Только администраторы могут использовать эти настройки",
        );
      }
    }
    ctx.session.options.menu = "groupchat";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_groupchat_close", async (ctx) => {
    if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) {
      const member = await ctx.api.getChatMember(ctx.chat!.id, ctx.from.id);
      if (member.status !== "administrator" && member.status !== "creator") {
        return ctx.answerCallbackQuery(
          "Только администраторы могут использовать эти настройки",
        );
      }
    }
    const target =
      ctx.session.options.message || ctx.callbackQuery.message?.message_id;
    try {
      if (target && ctx.chat) await ctx.api.deleteMessage(ctx.chat.id, target);
    } catch {
      await ctx.reply(
        `Произошла ошибка при попытке удалить сообщение. Сообщения отправленные ранее чем 48 часов назад не могут быть удалены ботом.`,
      );
    }
    ctx.session.options.message = 0;
  });
}

export const optionsCommands = new CommandGroup<Context>();

// Init options features
export async function initOptions(bot: Bot<Context>) {
  const commands = optionsCommands;

  commands
    .command("options", "Настройки")
    .addToScope({ type: "all_private_chats" }, async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      await ctx.deleteMessage();
      return openSettings(ctx);
    })
    .addToScope({ type: "all_chat_administrators" }, async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      return openSettings(ctx, "groupchat");
    })
    .addToScope({ type: "all_group_chats" }, async (ctx) => {
      if (!ctx.from || !ctx.message) return;
      if (ctx.from.id !== env.SCHED_BOT_ADMIN_TGID) return;
      return openSettings(ctx, "groupchat");
    });

  await initGroupchatOptions(bot);

  bot.callbackQuery("options_themes", async (ctx) => {
    ctx.session.options.menu = "themes";
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery(/options_theme_set_(\w+)/, async (ctx) => {
    const action = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : null;
    if (!action) {
      log.error(
        `Action not found error. Action: ${JSON.stringify(ctx.callbackQuery)}`,
        { user: ctx.callbackQuery.from.id },
      );
      return ctx.reply(
        `Произошла ошибка, пожалуйста попробуйте переоткрыть меню настроек`,
      );
    }
    const theme = ctx.match[1];
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(`Вас нет в базе данных, пожалуйста пропишите /start`);
    }
    const preferences = Object.assign(
      {},
      UserPreferencesDefaults,
      user.preferences,
    );
    if (preferences.theme === theme) {
      ctx.session.options.updText = `Оставляем тему: "${STYLEMAPS[theme].description}"`;
      ctx.session.options.menu = "";
      return updateOptionsMsg(ctx);
    }
    preferences.theme = theme;
    await db.user.update({
      where: { id: user.id },
      data: { preferences, lastActive: new Date() },
    });
    ctx.session.options.updText = `Тема успешно изменена на "${STYLEMAPS[theme].description}"`;
    ctx.session.options.menu = "";
    //if (ctx.session.scheduleViewer.message && ctx.session.scheduleViewer.week)
    //  void sendTimetable(ctx, ctx.session.scheduleViewer.week);
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_subgroup", async (ctx) => {
    ctx.session.options.menu = "subgroup";
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery(/options_subgroup_\d/, async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    const action = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : null;
    if (!action) {
      log.error(
        `Action not found error. Action: ${JSON.stringify(ctx.callbackQuery)}`,
        { user: ctx.callbackQuery.from.id },
      );
      return ctx.reply(
        `Произошла ошибка, пожалуйста попробуйте переоткрыть меню настроек`,
      );
    }
    const rawtarget = action.charAt(action.length - 1);
    if (Number.isNaN(Number(rawtarget))) {
      return ctx.reply(
        `Произошла ошибка. Подгруппа не является числом... Как так то...`,
      );
    }
    const target = Number(rawtarget);
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(`Вас нет в базе данных, пожалуйста пропишите /start`);
    }
    if (target === user.subgroup || (!target && !user.subgroup)) {
      ctx.session.options.updText = `Оставляем подгруппу: "${(user.subgroup ?? 0) || "Обе"}"`;
      ctx.session.options.menu = "";
      return updateOptionsMsg(ctx);
    }
    const now = new Date();
    await db.user.update({
      where: { id: user.id },
      data: {
        subgroup: target,
        lastActive: now,
        ics: {
          upsert: {
            create: { validUntil: now },
            update: { validUntil: now },
          },
        },
      },
    });
    await db.week.updateMany({
      where: { owner: user.id },
      data: { cachedUntil: now },
    });
    //if (ctx.session.scheduleViewer.message && ctx.session.scheduleViewer.week)
    //  void sendTimetable(ctx, ctx.session.scheduleViewer.week);
    ctx.session.options.updText = `Подгруппа изменена на "${target || "Обе"}"`;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_toggle_iet", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(`Вас нет в базе данных, пожалуйста пропишите /start`);
    }
    const preferences = Object.assign(
      {},
      UserPreferencesDefaults,
      user.preferences,
    );
    preferences.showIet = !preferences.showIet;
    const now = new Date();
    await db.user.update({
      where: { id: user.id },
      data: {
        preferences,
        lastActive: now,
        ics: {
          upsert: {
            create: { validUntil: now },
            update: { validUntil: now },
          },
        },
      },
    });
    await db.week.updateMany({
      where: { owner: user.id },
      data: { cachedUntil: now },
    });
    //if (ctx.session.scheduleViewer.message && ctx.session.scheduleViewer.week)
    //  void sendTimetable(ctx, ctx.session.scheduleViewer.week);
    ctx.session.options.updText = `Отображение ИОТов ${preferences.showIet ? "включено" : "отключено"}`;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_toggle_military", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(`Вас нет в базе данных, пожалуйста пропишите /start`);
    }
    const preferences = Object.assign(
      {},
      UserPreferencesDefaults,
      user.preferences,
    );
    preferences.showMilitary = !preferences.showMilitary;
    const now = new Date();
    await db.user.update({
      where: { id: user.id },
      data: {
        preferences,
        lastActive: now,
        ics: {
          upsert: {
            create: { validUntil: now },
            update: { validUntil: now },
          },
        },
      },
    });
    await db.week.updateMany({
      where: { owner: user.id },
      data: { cachedUntil: now },
    });
    //if (ctx.session.scheduleViewer.message && ctx.session.scheduleViewer.week)
    //  void sendTimetable(ctx, ctx.session.scheduleViewer.week);
    ctx.session.options.updText = `Отображение военки ${preferences.showMilitary ? "включено" : "отключено"}`;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_menu", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_close", async (ctx) => {
    const target =
      ctx.session.options.message || ctx.callbackQuery.message?.message_id;
    try {
      if (target && ctx.chat) await ctx.api.deleteMessage(ctx.chat.id, target);
    } catch {
      await ctx.reply(
        `Произошла ошибка при попытке удалить сообщение. Сообщения отправленные ранее чем 48 часов назад не могут быть удалены ботом.`,
      );
    }
    ctx.session.options.message = 0;
  });

  bot.callbackQuery("options_notifications", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    ctx.session.options.menu = "notifications";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_notifications_daystart_edit", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    ctx.session.options.menu = "notifications_daystart";
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery(
    /^options_notifications_daystart_set_(\d+)$/,
    async (ctx) => {
      if (!ctx.session.options.message)
        ctx.session.options.message =
          ctx.callbackQuery.message?.message_id ?? 0;
      const action =
        "data" in ctx.callbackQuery ? ctx.callbackQuery.data : null;
      if (!action) {
        log.error(
          `Action not found error. Action: ${JSON.stringify(ctx.callbackQuery)}`,
          { user: ctx.callbackQuery.from.id },
        );
        return ctx.reply(
          `Произошла ошибка, пожалуйста попробуйте переоткрыть меню настроек`,
        );
      }
      const rawtarget = ctx.match[1];
      if (Number.isNaN(Number(rawtarget))) {
        return ctx.reply(
          `Произошла ошибка. Время не является числом... Как так то...`,
        );
      }
      const time = Number(rawtarget) * 60;
      const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
      if (!user) {
        return ctx.reply(`Вас нет в базе данных, пожалуйста пропишите /start`);
      }
      const preferences = Object.assign(
        {},
        UserPreferencesDefaults,
        user.preferences,
      );
      if (time === preferences.notifyBeforeLessons) {
        ctx.session.options.updText = `Оставляем время: "${time / 60} мин"`;
        ctx.session.options.menu = "notifications";
        return updateOptionsMsg(ctx);
      }
      preferences.notifyBeforeLessons = time;
      const now = new Date();
      await db.user.update({
        where: { id: user.id },
        data: {
          preferences,
          lastActive: now,
        },
      });
      if (time)
        ctx.session.options.updText = `Установлено время: "${time / 60} мин"`;
      else
        ctx.session.options.updText = `Уведомления перед началом занятий отключены`;
      ctx.session.options.menu = "notifications";
      scheduleUserNotificationsUpdate(ctx, user);
      return updateOptionsMsg(ctx);
    },
  );

  bot.callbackQuery("options_notifications_nextlesson_toggle", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(`Вас нет в базе данных, пожалуйста пропишите /start`);
    }
    const preferences = Object.assign(
      {},
      UserPreferencesDefaults,
      user.preferences,
    );
    preferences.notifyAboutNextLesson = !preferences.notifyAboutNextLesson;
    await db.user.update({
      where: { id: user.id },
      data: { preferences, lastActive: new Date() },
    });
    ctx.session.options.updText = `Уведомления о следующей паре ${preferences.notifyAboutNextLesson ? "включены" : "отключены"}`;
    ctx.session.options.menu = "notifications";
    scheduleUserNotificationsUpdate(ctx, user);
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_notifications_nextday_toggle", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(`Вас нет в базе данных, пожалуйста пропишите /start`);
    }
    const preferences = Object.assign(
      {},
      UserPreferencesDefaults,
      user.preferences,
    );
    preferences.notifyAboutNextDay = !preferences.notifyAboutNextDay;
    await db.user.update({
      where: { id: user.id },
      data: { preferences, lastActive: new Date() },
    });
    ctx.session.options.updText = `Уведомления о следующем дне ${preferences.notifyAboutNextDay ? "включены" : "отключены"}`;
    ctx.session.options.menu = "notifications";
    scheduleUserNotificationsUpdate(ctx, user);
    return updateOptionsMsg(ctx);
  });

  bot.callbackQuery("options_notifications_nextweek_toggle", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      return ctx.reply(`Вас нет в базе данных, пожалуйста пропишите /start`);
    }
    const preferences = Object.assign(
      {},
      UserPreferencesDefaults,
      user.preferences,
    );
    preferences.notifyAboutNextWeek = !preferences.notifyAboutNextWeek;
    await db.user.update({
      where: { id: user.id },
      data: { preferences, lastActive: new Date() },
    });
    ctx.session.options.updText = `Уведомления о следующей неделе ${preferences.notifyAboutNextWeek ? "включены" : "отключены"}`;
    ctx.session.options.menu = "notifications";
    scheduleUserNotificationsUpdate(ctx, user);
    return updateOptionsMsg(ctx);
  });

  bot.use(commands);
  return commands;
}
