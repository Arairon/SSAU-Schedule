import { InlineKeyboard, type Bot } from "grammy";
import { type Context } from "./types";
import { CommandGroup } from "@grammyjs/commands";
import { env } from "@/env";
import { getPersonShortname } from "@ssau-schedule/shared/utils";
import log from "@/logger";
import { getDefaultSession } from ".";
import { api } from "@/serverClient";
import { getUser } from "./misc";

async function reset(_ctx: Context, userId: number) {
  const user = await api.user
    .tgid({ id: userId })
    .get()
    .then((res) => res.data);
  if (user) await api.user.id({ id: user.id }).delete();
}

async function start(ctx: Context, userId: number | bigint) {
  await api.user.new.post({ tgId: userId as unknown as bigint });
  Object.assign(ctx.session, getDefaultSession());
  await ctx.reply(
    `\
Добро пожаловать!
Этот бот создан в первую очередь для работы для работы с личным кабинетом самарского университета.

По началу расписания могу отправляться довольно долго, т.к. бот будет отправлять их впервые. (спасибо ркн) 
В дальнейшем расписания будут отправляться по 1-3 секунды, т.к. они будут подгружаться ночью заранее.

Исходный код: https://github.com/arairon/ssau-schedule
Администратор бота: ${env.SCHED_BOT_ADMIN_CONTACT}
Автор бота: @arairon
    `,
    {
      reply_markup: new InlineKeyboard().text("Начать", "start_onboarding"),
      link_preview_options: { is_disabled: true },
    },
  );
}

export const accountCommands = new CommandGroup<Context>();

export async function initAccount(bot: Bot<Context>) {
  const commands = accountCommands;

  commands.command("start", "Начало/Сброс работы с ботом", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const userId = ctx.from?.id;
    if (!userId) {
      return ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
        parse_mode: "HTML",
      });
    }
    const existingUser = await getUser(ctx);
    if (existingUser === false) return; // getUser уже отправил сообщение об ошибке
    if (!existingUser) {
      return start(ctx, userId as unknown as bigint);
    } else {
      return ctx.reply(
        `\
Вы уверены что хотите сбросить все настройки?
Если вы хотите поменять настройки - используйте /options
${
  existingUser.authCookie
    ? "Если вы хотите просто выйти из аккаунта - используйте /logout"
    : "Если вы хотите войти в личный кабинет - используйте /login"
}
Будет сброшено всё: Календари, настроки, данные для входа, группы и т.п.
        `,
        {
          reply_markup: new InlineKeyboard()
            .text("Отмена", "start_reset_cancel")
            .text("Да, сбросить", "start_reset_confirm"),
        },
      );
    }
  });

  bot.callbackQuery("start_onboarding", async (ctx) => {
    log.info(`Starting onboarding conversation`, { user: ctx.from?.id });
    await ctx.answerCallbackQuery().catch();
    return ctx.conversation.enter("ONBOARDING");
  });

  bot.callbackQuery("start_reset_cancel", async (ctx) => {
    log.debug("start_reset_cancel", { user: ctx.from.id });
    if (ctx.callbackQuery.message?.message_id)
      void ctx.api.deleteMessage(
        ctx.from.id,
        ctx.callbackQuery.message?.message_id,
      );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("start_reset_confirm", async (ctx) => {
    log.debug("start_reset_confirm", { user: ctx.from.id });
    if (ctx.callbackQuery.message?.message_id)
      void ctx.api.deleteMessage(
        ctx.from.id,
        ctx.callbackQuery.message?.message_id,
      );
    await ctx.answerCallbackQuery();
    return reset(ctx, ctx.from.id).then(() => start(ctx, ctx.from.id));
  });

  commands.command("login", "Вход в личный кабинет", async (ctx) => {
    if (!ctx.from) return;
    if (ctx.chat.type !== "private") return;
    const user = await getUser(ctx);
    if (user === false) return; // getUser уже отправил сообщение об ошибке
    if (user) {
      ctx.session.loggedIn = true;
      if (user.username && user.password) {
        await ctx.reply(`
Вы уже вошли как '${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")} (${user.username})'.
Если вы хотите выйти - используйте /logout
      `);
        return;
      }
      if (user.authCookie && user.sessionExpiresAt > new Date()) {
        await ctx.reply(`
Ваша сессия как '${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")}' всё ещё активна.
Если вы хотите её прервать, используйте /logout
      `);
        return;
      }
    }
    return ctx.conversation.enter("LK_LOGIN");
    //void ctx.deleteMessage(ctx.message.message_id);
    //return ctx.scene.enter("LK_LOGIN");
  });

  commands.command("logout", "Выход из личного кабинета", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (!ctx.from) {
      return ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
        parse_mode: "HTML",
      });
    }
    const user = await getUser(ctx, { required: true });
    if (!user) return;
    const hadCredentials = user.username && user.password;
    await api.user.id({ id: user.id }).lk.clearCredentials.post();
    return ctx.reply(
      `
Сессия завершена. ${hadCredentials ? "Данные для входа удалены." : ""}
Внимание: Если вы собираетесь в будующем входить в <b>другой</b> аккаунт ссау, то вам следует сбросить данные о себе через /start
Если же вы собираетесь продолжать использовать текущий аккаунт - сбрасывать ничего не нужно.
      `,
      { parse_mode: "HTML" },
    );
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
      .then((res) => res.data);
    if (!cal) {
      return ctx.reply(
        `Произошла ошибка при попытке создать календарь.\nПожалуйста попробуйте позже или свяжитесь с администратором бота`,
      );
    }
    return ctx.reply(
      `\
Ваша ссылка:
https://${env.SCHED_SERVER_DOMAIN}/api/v0/ics/${cal.uuid}

‼️Файл по этой ссылке не для скачивания
Содержимое файла генерируется динамически в зависимости от текущего расписания и ваших настроек.
Добавьте её в календарь и включите синхронизацию.
 `,
      { link_preview_options: { is_disabled: true } },
    );
  });

  commands.command("help", "Информация о боте", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const user = await getUser(ctx);
    if (user === false) return; // getUser уже отправил сообщение об ошибке
    if (!user)
      return ctx.reply(
        `\
Добро пожаловать!
Этот бот создан в первую очередь для работы для работы с личным кабинетом самарского университета.

Вы можете начать работу с ботом по команде /start
После этого вам будет предложено пройти быструю настройку, которая поможет боту понять какое расписание вам нужно и как его доставать.
Если вы пропустите её или захотите изменить настройки позже, вы всегда сможете сделать это по команде /options

Более подробная помощь доступна после начала

Исходный код: https://github.com/Arairon/SSAU-Schedule
Администратор бота: ${env.SCHED_BOT_ADMIN_CONTACT}
Автор бота: @arairon
`,
        { link_preview_options: { is_disabled: true } },
      );
    return ctx.reply(
      `\
Добро пожаловать, ${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")}!

Вы можете запросить своё расписание по команде /schedule [номер недели?] (по умолчанию текущая неделя)
Или расписание конкретной группа (игнорируя настройки) /schedule [группа] [номер недели?]
Так же можно запросить неделю просто введя её номер в чат.
Для запроса расписания группы просто введите её номер (например "6101-090301D" или частично "6101" для поиска)
Вы можете запросить ссылку на ICS календарь по команде /ics
Вы можете изменить настройки по команде /options
Если вы хотите выйти из аккаунта - используйте /logout
Если вы хотите сбросить все данные о себе - используйте /start

Внимание: Расписания "на холодную" могут отправляться по 5-10 секунд.
Расписания подгружаются ежедневно в час ночи на 8 недель чтобы это компенсировать, однако подгружаются они только для текущих настроек, так что при смене настрое может снова потребоваться генерировать новые изображения

Исходный код: https://github.com/Arairon/SSAU-Schedule
Администратор бота: ${env.SCHED_BOT_ADMIN_CONTACT}
Автор бота: @arairon
`,
      { link_preview_options: { is_disabled: true } },
    );
  });

  commands.command("app", "Переход в веб приложение", async (ctx) => {
    void ctx.deleteMessage();
    if (
      env.NODE_ENV !== "development" &&
      !(ctx.message && ctx.message.text.includes("idontcare"))
    ) {
      return ctx.reply(
        "Веб приложение всё ещё в разработке. Очень надеюсь что скоро смогу его выпустить, но на данный момент оно слишком сырое. Простите :D",
      );
    }
    return ctx.reply(
      "Переход в веб приложение\n(Веб приложение специально не добавлено как отдельная кнопка в боте, т.к. приоритет всё же на команды)",
      {
        reply_markup: new InlineKeyboard().webApp(
          "Открыть",
          `https://${env.SCHED_APP_DOMAIN}/tg-wait`,
        ),
      },
    );
  });

  bot.use(commands);
}
