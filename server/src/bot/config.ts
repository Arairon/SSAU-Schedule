import { type Telegraf } from "telegraf";
import timestring from "timestring";
import { type Context } from "./types";
import { db } from "../db";
import { UserPreferencesDefaults } from "../lib/misc";
import { STYLEMAPS } from "../lib/scheduleImage";
import { sendTimetable } from "./schedule";

// config.ts refers to the /config command, not the bot configuration :]
const config_field_names: Record<string, string> = {
  theme: `theme`,
  subgroup: "subgroup",
  notifyBeforeLessons: "notify daystart",
  group: "group",
};

// init config command
export async function initConfig(bot: Telegraf<Context>) {
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
      { group: user.group?.name ?? null, subgroup: user.subgroup ?? 0 },
      user.preferences,
    );
    if (args.length === 0) {
      return ctx.reply(`\
Текущие параметры:
${Object.entries(preferences)
  .filter(([k]) => k in config_field_names)
  .map(([k, v]) => `${config_field_names[k]}: ${v}`)
  .join("\n")}

Параметры используются для продвинутых настроек. Для обычных функций используйте /options.
`);
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
