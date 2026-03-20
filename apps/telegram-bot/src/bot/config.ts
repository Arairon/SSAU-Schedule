import type { Bot } from "grammy";
import timestring from "timestring";
import { type Context } from "./types";
import { getUserPreferences } from "@ssau-schedule/shared/utils";
import { stylemaps } from "@ssau-schedule/shared/themes/index";
import { CommandGroup } from "@grammyjs/commands";
import { api } from "@/serverClient";

// config.ts refers to the /config command, not the bot configuration :]
const config_field_names: Record<string, string> = {
  theme: `theme`,
  subgroup: "subgroup",
  notifyBeforeLessons: "notify daystart",
  group: "group",
};

export const configCommands = new CommandGroup<Context>();
// init config command
export async function initConfig(bot: Bot<Context>) {
  const commands = configCommands;

  commands.command("config", "Продвинутые настройки", async (ctx) => {
    if (!ctx.from || !ctx.message) return;
    if (ctx.chat.type !== "private") return;
    const args = ctx.message.text.trim().split(" ");
    args.shift(); // remove command
    const user = await api.user
      .tgid({ id: ctx.from.id })
      .get()
      .then((res) => res.data);
    if (!user)
      return ctx.reply(
        "Вас не существует в базе данных. Пожалуйста пропишите /start",
      );
    const preferences = Object.assign({}, getUserPreferences(user), {
      group: user.group?.name ?? null,
      subgroup: user.subgroup ?? 0,
    });
    if (args.length === 0) {
      return ctx.reply(`\
Текущие параметры:
${Object.entries(preferences)
  .filter(([k]) => k in config_field_names)
  .map(([k, v]) => `${config_field_names[k]}: ${String(v)}`)
  .join("\n")}

Параметры используются для продвинутых настроек. Для обычных функций используйте /options.
`);
    }
    const field = args.shift()!.toLowerCase();
    switch (field) {
      case "theme": {
        const themes = Object.keys(stylemaps);
        const target = args[0];
        if (!target) {
          return ctx.reply(`Доступные темы: ${themes.join(", ")}`);
        } else if (!themes.includes(target)) {
          return ctx.reply(
            `Такой темы нет.\nДоступные темы: ${themes.join(", ")}`,
          );
        }
        preferences.theme = target;
        await api.user.id({ id: user.id }).patch({
          preferences,
        });
        //if (ctx.session.scheduleViewer.message)
        //  void sendTimetable(ctx, ctx.session.scheduleViewer.week);
        return ctx.reply(`Тема успешно изменена на '${target}'`);
      }
      case "subgroup": {
        const arg = args[0]?.trim();
        const target = isNaN(Number(arg)) ? null : Number(arg);
        if (!arg || target === null || target < 0 || target > 2) {
          return ctx.reply(
            `Вы можете установить себе подгруппу 1 или 2.\nПодгруппа 0 - обе\nВаша подгруппа: ${user.subgroup ?? 0}`,
          );
        }
        await api.user.id({ id: user.id }).patch({
          subgroup: target,
        });
        await api.cache["user-ics"].invalidate.patch({ userId: user.id });
        return ctx.reply(`Подгруппа успешно изменена на ${target}`);
      }
      case "notify": {
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
          await api.user.id({ id: user.id }).patch({
            preferences,
          });
          return ctx.reply(
            `Установлено время: ${time}с (${(time / 3600).toFixed(2)}ч)`,
          );
        }
      }
      case "group": {
        const arg = args[0]?.trim();
        if (!arg) {
          return ctx.reply(
            `Ваша текущая группа: ${user.group?.name ?? "не установлена"}`,
          );
        }
        const newgroup = await api.ssau.findGroupOrOptions
          .get({ query: { name: arg } })
          .then((res) => res.data?.[0]);
        if (!newgroup) {
          return ctx.reply(
            `Не удалось найти группу по запросу '${arg}'. Попробуйте более точно указать название группы.`,
          );
        }
        const updated = await api.user
          .id({ id: user.id })
          .patch({
            groupId: newgroup.id,
          })
          .then((res) => res.data);
        await api.cache.week.invalidate.patch({ owner: user.id });
        await api.cache["user-ics"].invalidate.patch({ userId: user.id });
        return ctx.reply(
          `Группа успешно изменена на '${updated!.group!.name}'`,
        );
      }
      default: {
        return ctx.reply("Поле не найдено");
      }
    }
  });
  bot.use(commands);
  return commands;
}
