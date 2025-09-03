import { Markup, type Telegraf } from "telegraf";
import { fmt } from "telegraf/format";
import timestring from "timestring";
import { type Context } from "./types";
import log from "../logger";
import { db } from "../db";
import { UserPreferencesDefaults } from "../lib/misc";
import { STYLEMAPS } from "../lib/scheduleImage";
import { sendTimetable } from "./schedule";

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
};

async function updateOptionsMsg(ctx: Context) {
  if (ctx.session.options.message === 0) {
    ctx.session.options.message = (await ctx.reply("Настройки")).message_id;
  }
  const menu = ctx.session.options.menu;
  const chat = ctx.from?.id ?? ctx.chat?.id;
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
  const newText = fmt`Настройки\n==============================\n${(ctx.session.options.updText ?? "") || menuText[menu] || ""}`;
  ctx.session.options.updText = null;
  if (menu === "") {
    const theme =
      STYLEMAPS[preferences.theme ?? "default"] ?? STYLEMAPS.default;
    return ctx.telegram
      .editMessageText(
        chat,
        msgId,
        undefined,
        newText,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `Тема: ${theme.description}`,
              "options_themes",
            ),
          ],
          [
            Markup.button.callback(
              `Подгруппа: ${(user.subgroup ?? 0) || "Обе"}`,
              "options_subgroup",
            ),
          ],
          [
            Markup.button.callback(
              `ИОТы: ${preferences.showIet ? "✅" : "❌"}`,
              "options_toggle_iet",
            ),
            Markup.button.callback(
              `Военка: ${preferences.showMilitary ? "✅" : "❌"}`,
              "options_toggle_military",
            ),
          ],
          [Markup.button.callback(`Уведомления`, "options_notifications")],
          [Markup.button.callback("Закрыть", "options_close")],
        ]),
      )
      .catch(() => {
        /* ignore */
      });
  } else if (menu === "themes") {
    return ctx.telegram.editMessageText(
      chat,
      msgId,
      undefined,
      newText,
      Markup.inlineKeyboard([
        ...Object.values(STYLEMAPS).map((theme) => [
          Markup.button.callback(
            `${theme.description}`,
            `options_theme_set_${theme.name}`,
          ),
        ]),
        [Markup.button.callback("Назад", "options_menu")],
      ]),
    );
  } else if (menu === "subgroup") {
    return ctx.telegram.editMessageText(
      chat,
      msgId,
      undefined,
      newText,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("Обе", "options_subgroup_0"),
          Markup.button.callback("Первая", "options_subgroup_1"),
          Markup.button.callback("Вторая", "options_subgroup_2"),
        ],
        [Markup.button.callback("Назад", "options_menu")],
      ]),
    );
  } else if (menu === "notifications") {
    const notifyBeforeLessonsMinutes = Math.round(
      preferences.notifyBeforeLessons / 60,
    );
    return ctx.telegram.editMessageText(
      chat,
      msgId,
      undefined,
      newText,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `Перед началом занятий: ${notifyBeforeLessonsMinutes ? `за ${notifyBeforeLessonsMinutes} мин` : "Выкл"}`,
            "options_notifications_daystart_edit",
          ),
        ],
        [
          Markup.button.callback(
            `О следующей паре: ${preferences.notifyAboutNextLesson ? "✅" : "❌"}`,
            "options_notifications_nextlesson_toggle",
          ),
        ],
        [
          Markup.button.callback(
            `О следующем дне: ${preferences.notifyAboutNextDay ? "✅" : "❌"}`,
            "options_notifications_nextday_toggle",
          ),
        ],
        [
          Markup.button.callback(
            `О следующей неделе: ${preferences.notifyAboutNextWeek ? "✅" : "❌"}`,
            "options_notifications_nextweek_toggle",
          ),
        ],
        [Markup.button.callback("Назад", "options_menu")],
      ]),
    );
  } else if (menu === "notifications_daystart") {
    return ctx.telegram.editMessageText(
      chat,
      msgId,
      undefined,
      newText,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `Отключить`,
            "options_notifications_daystart_set_0",
          ),
        ],
        [
          Markup.button.callback(
            `15 мин`,
            "options_notifications_daystart_set_15",
          ),
          Markup.button.callback(
            `30 мин`,
            "options_notifications_daystart_set_30",
          ),
          Markup.button.callback(
            `45 мин`,
            "options_notifications_daystart_set_45",
          ),
        ],
        [
          Markup.button.callback(
            `1 час`,
            "options_notifications_daystart_set_60",
          ),
          Markup.button.callback(
            `1.5 часа`,
            "options_notifications_daystart_set_90",
          ),
          Markup.button.callback(
            `2 часа`,
            "options_notifications_daystart_set_120",
          ),
        ],
        [
          Markup.button.callback(
            `2.5 часа`,
            "options_notifications_daystart_set_150",
          ),
          Markup.button.callback(
            `3 часа`,
            "options_notifications_daystart_set_180",
          ),
          Markup.button.callback(
            `4 часа`,
            "options_notifications_daystart_set_240",
          ),
        ],
        [Markup.button.callback("Назад", "options_notifications")],
      ]),
    );
  }
}

export async function openSettings(ctx: Context) {
  if (ctx.session.options.message)
    void ctx.deleteMessage(ctx.session.options.message);
  ctx.session.options = {
    message: 0,
    menu: "",
    updText: null,
  };
  return updateOptionsMsg(ctx);
}

//TODO: Allow configs in /config with 'timestring'

// Init options features
export async function initOptions(bot: Telegraf<Context>) {
  bot.command("options", async (ctx) => {
    await ctx.deleteMessage(ctx.message.message_id);
    return openSettings(ctx);
  });

  bot.action("options_themes", async (ctx) => {
    ctx.session.options.menu = "themes";
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    return updateOptionsMsg(ctx);
  });

  bot.action(/options_theme_set_(\w+)/, async (ctx) => {
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
    if (ctx.session.scheduleViewer.message && ctx.session.scheduleViewer.week)
      void sendTimetable(ctx, ctx.session.scheduleViewer.week);
    return updateOptionsMsg(ctx);
  });

  bot.action("options_subgroup", async (ctx) => {
    ctx.session.options.menu = "subgroup";
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    return updateOptionsMsg(ctx);
  });

  bot.action(/options_subgroup_\d/, async (ctx) => {
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
    if (ctx.session.scheduleViewer.message && ctx.session.scheduleViewer.week)
      void sendTimetable(ctx, ctx.session.scheduleViewer.week);
    ctx.session.options.updText = `Подгруппа изменена на "${target || "Обе"}"`;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.action("options_toggle_iet", async (ctx) => {
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
    if (ctx.session.scheduleViewer.message && ctx.session.scheduleViewer.week)
      void sendTimetable(ctx, ctx.session.scheduleViewer.week);
    ctx.session.options.updText = `Отображение ИОТов ${preferences.showIet ? "включено" : "отключено"}`;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.action("options_toggle_military", async (ctx) => {
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
    if (ctx.session.scheduleViewer.message && ctx.session.scheduleViewer.week)
      void sendTimetable(ctx, ctx.session.scheduleViewer.week);
    ctx.session.options.updText = `Отображение военки ${preferences.showMilitary ? "включено" : "отключено"}`;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.action("options_menu", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.action("options_close", async (ctx) => {
    const target =
      ctx.session.options.message || ctx.callbackQuery.message?.message_id;
    try {
      await ctx.deleteMessage(target);
    } catch {
      await ctx.reply(`Произошла ошибка.`);
    }
    ctx.session.options.message = 0;
  });

  bot.action("options_notifications", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    ctx.session.options.menu = "notifications";
    return updateOptionsMsg(ctx);
  });

  bot.action("options_notifications_daystart_edit", async (ctx) => {
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    ctx.session.options.menu = "notifications_daystart";
    return updateOptionsMsg(ctx);
  });

  bot.action(/^options_notifications_daystart_set_\d+$/, async (ctx) => {
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
    return updateOptionsMsg(ctx);
  });

  bot.action("options_notifications_nextlesson_toggle", async (ctx) => {
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
    return updateOptionsMsg(ctx);
  });

  bot.action("options_notifications_nextday_toggle", async (ctx) => {
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
    return updateOptionsMsg(ctx);
  });

  bot.action("options_notifications_nextweek_toggle", async (ctx) => {
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
    return updateOptionsMsg(ctx);
  });

  bot.command("config", async (ctx) => {
    const args = ctx.message.text.trim().split(" ");
    args.shift(); // remove command
    const user = await db.user.findUnique({
      where: { tgId: ctx.from.id },
      include: { group: true },
    });
    if (!user)
      return ctx.reply(
        "Вас не существует в базе данных. Пожалуйста пропишите /start",
      );
    const preferences = Object.assign(
      {},
      UserPreferencesDefaults,
      user.preferences,
    );
    if (args.length === 0) {
      return ctx.reply(
        `Текущие параметры:\n${JSON.stringify(
          Object.assign(
            {},
            {
              theme: "placeholder",
              subgroup: user.subgroup,
              group: user.group
                ? `${user.group.name} #${user.groupId}`
                : "Отсутствует",
            },
            preferences,
          ),
          null,
          2,
        )}`,
      );
    }
    const field = args.shift()!.toLowerCase();
    if (field === "theme") {
      const themes = Object.keys(STYLEMAPS);
      const target = args[0];
      if (!target) {
        return ctx.reply(`Доступные темы: ${themes.join(", ")}`);
      } else if (!themes.includes(target)) {
        return ctx.reply(
          `Такой темы нет.\nДоступные темы: ${themes.join(", ")}`,
        );
      }
      preferences.theme = target;
      await db.user.update({
        where: { id: user.id },
        data: { preferences, lastActive: new Date() },
      });
      if (ctx.session.scheduleViewer.message)
        void sendTimetable(ctx, ctx.session.scheduleViewer.week);
      return ctx.reply(`Тема успешно изменена на '${target}'`);
    } else if (field === "subgroup") {
      const arg = args[0]?.trim();
      const target = isNaN(Number(arg)) ? null : Number(arg);
      if (!arg || target === null || target < 0 || target > 2) {
        return ctx.reply(
          `Вы можете установить себе подгруппу 1 или 2.\nПодгруппа 0 - обе\nВаша подгруппа: ${user.subgroup ?? 0}`,
        );
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
      return ctx.reply(`Подгруппа успешно изменена на ${target}`);
    } else if (field === "notify") {
      const subfield = args.shift()?.toLowerCase() ?? null;
      if (!subfield) {
        return ctx.reply(
          "Для настройки уведомлений требуется выбрать поле, например /config notify daystart [время]",
        );
      }
      if (subfield === "daystart") {
        const arg = args.join(" ");
        if (!arg) {
          return ctx.reply(
            "Для настройки уведомлений о начале занятий требуется выбрать время.\nПример: /config notify daystart 1h 30m 30s",
          );
        }
        const time = timestring(arg, "seconds");
        if (time < 0 || time > 14400) {
          return ctx.reply(
            `Максимальное время: 4 часа. Получено время: ${time}с (${(time / 3600).toFixed(2)}ч)`,
          );
        }
        preferences.notifyBeforeLessons = time;
        await db.user.update({
          where: { id: user.id },
          data: {
            preferences,
            lastActive: new Date(),
          },
        });
        return ctx.reply(
          `Установлено время: ${time}с (${(time / 3600).toFixed(2)}ч)`,
        );
      }
    } else {
      return ctx.reply("Поле не найдено");
    }
  });
}
