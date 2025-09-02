import { Markup, Telegraf, type Context as TelegrafContext } from "telegraf";
import { Context } from "./types";
import log from "../logger";
import { db } from "../db";
import { formatBigInt } from "../lib/utils";
import { env } from "../env";
import { schedule } from "../lib/schedule";
import { fmt, pre } from "telegraf/format";
import { CallbackQuery, Message, Update } from "telegraf/types";
import { UserPreferencesDefaults } from "../lib/misc";
import { handleError } from "./bot";
import { User } from "@prisma/client";
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
  const newText = fmt`Настройки\n==============================\n${ctx.session.options.updText || menuText[menu] || ""}`;
  ctx.session.options.updText = null;
  if (menu === "") {
    ctx.telegram.editMessageText(
      chat,
      msgId,
      undefined,
      newText,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `Тема: ${STYLEMAPS[preferences.theme ?? "default"].description}`,
            "options_themes",
          ),
        ],
        [
          Markup.button.callback(
            `Подгруппа: ${user.subgroup || "Обе"}`,
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
        [Markup.button.callback("Закрыть", "options_close")],
      ]),
    );
  } else if (menu === "themes") {
    ctx.telegram.editMessageText(
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
    ctx.telegram.editMessageText(
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
  }
}

export async function openSettings(ctx: Context) {
  if (ctx.session.options.message)
    ctx.deleteMessage(ctx.session.options.message);
  ctx.session.options = {
    message: 0,
    menu: "",
    updText: null,
  };
  updateOptionsMsg(ctx);
}

// Init options features
export async function initOptions(bot: Telegraf<Context>) {
  bot.command("options", async (ctx) => {
    ctx.deleteMessage(ctx.message.message_id);
    openSettings(ctx);
  });

  bot.action("options_themes", async (ctx) => {
    ctx.session.options.menu = "themes";
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    updateOptionsMsg(ctx);
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
    const theme = action.slice(`options_theme_set_`.length);
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
    await db.user.update({ where: { id: user.id }, data: { preferences } });
    ctx.session.options.updText = `Тема успешно изменена на "${STYLEMAPS[theme].description}"`;
    ctx.session.options.menu = "";
    if (ctx.session.scheduleViewer.message && ctx.session.scheduleViewer.week)
      sendTimetable(ctx, ctx.session.scheduleViewer.week);
    updateOptionsMsg(ctx);
  });

  bot.action("options_subgroup", async (ctx) => {
    ctx.session.options.menu = "subgroup";
    if (!ctx.session.options.message)
      ctx.session.options.message = ctx.callbackQuery.message?.message_id ?? 0;
    updateOptionsMsg(ctx);
  });

  bot.action(/options_subgroup_\d/, async (ctx) => {
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
      ctx.session.options.updText = `Оставляем подгруппу: "${user.subgroup || "Обе"}"`;
      ctx.session.options.menu = "";
      return updateOptionsMsg(ctx);
    }
    const now = new Date();
    await db.user.update({
      where: { id: user.id },
      data: {
        subgroup: target,
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
    ctx.session.options.updText = `Подгруппа изменена на "${target || "Обе"}"`;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.action("options_toggle_iet", async (ctx) => {
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
    ctx.session.options.updText = `Отображение ИОТов ${preferences.showIet ? "включено" : "отключено"}`;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.action("options_toggle_military", async (ctx) => {
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
    ctx.session.options.updText = `Отображение военки ${preferences.showIet ? "включено" : "отключено"}`;
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.action("options_menu", async (ctx) => {
    ctx.session.options.menu = "";
    return updateOptionsMsg(ctx);
  });

  bot.action("options_close", async (ctx) => {
    const target =
      ctx.session.options.message || ctx.callbackQuery.message?.message_id;
    try {
      await ctx.deleteMessage(target);
    } catch {
      ctx.reply(`Произошла ошибка.`);
    }
    ctx.session.options.message = 0;
  });
}
