import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import {
  Input,
  Markup,
  Scenes,
  session,
  Telegraf,
  type Context as TelegrafContext,
  type SessionStore,
} from "telegraf";
import { message } from "telegraf/filters";
import { env } from "./env";

import { Context, Session } from "./types";
import log from "./logger";
import { db } from "./db";
import { bold, fmt, italic } from "telegraf/format";
import { lk } from "./lib/lk";
import { formatBigInt, getPersonShortname, getWeekFromDate } from "./lib/utils";
import { loginScene } from "./scenes/login";
import { schedule } from "./lib/schedule";
import { CallbackQuery, Message, Update } from "telegraf/types";
import { findGroup, findGroupOrOptions } from "./lib/misc";

function getDefaultSession(): Session {
  return {
    tempMessages: [],
    sceneData: {},
    loggedIn: false,
    scheduleViewer: {
      message: 0,
      chatId: 0,
      week: 0,
      groupId: undefined,
    },
  };
}

async function reset(ctx: Context, userId: number) {
  await db.user.delete({ where: { id: userId } });
}

async function start(ctx: Context, userId: number) {
  await db.user.create({ data: { tgId: userId } });
  Object.assign(ctx.session, getDefaultSession());
  ctx.reply(fmt`
Добро пожаловать!
Этот бот создан в первую очередь для работы для работы с личным кабинетом самарского университета.
Возможность делать анонимные запросы возможно будет добавлена позже.
Для начала потребуется войти в личный кабинет. Вы можете это сделать по команде /login
Каковы гарантии что я не украду ваш аккаунт лк? Никаких :)
Ну а если серьёзно, то зачем оно мне надо...
    `);
}

export function deleteTempMessages(ctx: Context, event: string) {
  const now = new Date();
  const expired = ctx.session.tempMessages
    .filter((msg) => msg.deleteAfter && now > msg.deleteAfter)
    .map((msg) => msg.id);
  const wildcardEvent = event.endsWith("*") && event.slice(0, event.length - 1);
  const deletedByEvent = ctx.session.tempMessages
    .filter(
      (msg) =>
        msg.deleteOn &&
        (msg.deleteOn.includes("*") ||
          msg.deleteOn.includes(event) ||
          (wildcardEvent && msg.deleteOn.find((ev) => ev.startsWith(event))) ||
          msg.deleteOn.find(
            (ev) =>
              ev.endsWith("*") && event.startsWith(ev.slice(0, ev.length - 1)),
          )),
    )
    .map((msg) => msg.id);

  const target = [...expired, ...deletedByEvent];
  const uniqueTargets: number[] = [];
  for (const msg of target) {
    if (!uniqueTargets.includes(msg)) uniqueTargets.push(msg);
  }
  ctx.session.tempMessages = ctx.session.tempMessages.filter(
    (msg) => !uniqueTargets.includes(msg.id),
  );

  if (uniqueTargets.length > 0) ctx.deleteMessages(uniqueTargets);
}

const stage = new Scenes.Stage([loginScene]);

async function sendTimetable(
  ctx: Context,
  week: number,
  opts?: {
    groupId?: number;
    ignoreCached?: boolean;
    forceUpdate?: boolean;
    queryCtx?: TelegrafContext<Update.CallbackQueryUpdate<CallbackQuery>>;
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
    ctx.reply("Вы не найдены в базе данных. Пожалуйста проишите /start");
    return;
  }
  const group =
    opts?.groupId ?? ctx.session.scheduleViewer.groupId ?? undefined;

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
    `[BOT] Image viewer [F:${timetable.data.isCommon} I:${timetable.data.withIet}] ${timetable.data.groupId}/${timetable.data.week}. Took ${formatBigInt(endTime - startTime)}ns`,
    { user: ctx.from.id },
  );
}

async function sendErrorMessage(ctx: Context, comment?: string) {
  try {
    ctx.reply(
      `Что-то пошло не так. Свяжитесь с ${env.SCHED_BOT_ADMIN_CONTACT}.\n${comment ?? ""}`,
    );
  } catch {
    log.error("Error occured during sendErrorMessage. Ignoring.", {
      user: ctx?.from?.id ?? ctx.chat?.id ?? "unknown",
    });
  }
}

async function handleError(ctx: Context, error: any) {
  sendErrorMessage(ctx);
  log.error(`Bot threw an error: E: ${JSON.stringify(error)}`, {
    user: ctx?.from?.id ?? ctx.chat?.id ?? "unknown",
  });
  if (env.NODE_ENV === "development") throw error;
}

//TODO: Ensure commands are guarded against non logged in users or fall them back to 'common'
async function init_bot(bot: Telegraf<Context>) {
  bot.launch(() => log.info("Bot started!"));

  bot.use(stage.middleware());

  bot.use((ctx: Context, next) => {
    if (ctx.message && "text" in ctx.message)
      log.debug(`${ctx.message.text}`, { user: ctx?.from?.id ?? -1 });
    next();
  });

  bot.catch((err, ctx) => {
    handleError(ctx, err);
  });

  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const existingUser = await db.user.findUnique({
      where: { tgId: ctx.from.id },
    });
    if (!existingUser) {
      start(ctx, userId);
    } else {
      ctx.session.tempMessages.push({
        id: ctx.message.message_id,
        deleteAfter: new Date(Date.now() + 300_000),
        deleteOn: ["start_reset_cancel"],
      });
      const msg = await ctx.reply(
        fmt`
Вы уверены что хотите сбросить все настройки?
Будет сброшено всё: Календари, настроки, данные для входа, группы и т.п.
        `,
        Markup.inlineKeyboard([
          Markup.button.callback("Отмена", "start_reset_cancel"),
          Markup.button.callback("Да, сбросить", "start_reset_confirm"),
        ]),
      );

      ctx.session.tempMessages.push({
        id: msg.message_id,
        deleteAfter: new Date(Date.now() + 300_000),
        deleteOn: ["start_reset_*"],
      });
    }
  });

  bot.action("start_reset_cancel", async (ctx) => {
    log.debug("start_reset_cancel", { user: ctx.from.id });
    deleteTempMessages(ctx, "start_reset_cancel");
    await ctx.answerCbQuery();
  });

  bot.action("start_reset_confirm", async (ctx) => {
    log.debug("start_reset_confirm", { user: ctx.from.id });
    deleteTempMessages(ctx, "start_reset_confirm");
    await ctx.answerCbQuery();
    reset(ctx, ctx.from.id).then(() => start(ctx, ctx.from.id));
  });

  bot.command("login", async (ctx) => {
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (user) {
      ctx.session.loggedIn = true;
      if (user.username && user.password) {
        const msg = await ctx.reply(fmt`
Вы уже вошли как '${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")} (${user.username})'.
Если вы хотите выйти - используйте /logout
      `);
        ctx.session.tempMessages.push({
          id: msg.message_id,
          deleteAfter: new Date(Date.now() + 60_000),
        });
        return;
      }
      if (user.authCookie && user.sessionExpiresAt > new Date()) {
        const msg = await ctx.reply(fmt`
Ваша сессия как '${getPersonShortname(user.fullname ?? "ВременноНеизвестный Пользователь")}' всё ещё активна.
Если вы хотите её прервать, используйте /logout
      `);
        ctx.session.tempMessages.push({
          id: msg.message_id,
          deleteAfter: new Date(Date.now() + 60_000),
        });
        return;
      }
    }
    deleteTempMessages(ctx, "scene_enter");
    deleteTempMessages(ctx, "login");
    ctx.deleteMessage(ctx.message.message_id);
    return ctx.scene.enter("LK_LOGIN");
  });

  bot.command("logout", async (ctx) => {
    const user = await db.user.findUnique({ where: { tgId: ctx.from.id } });
    if (!user) {
      sendErrorMessage(
        ctx,
        "Вас не существует в базе данных. Пожалуйста пропишите /start",
      );
      return;
    }
    await lk.resetAuth(user!, { resetCredentials: true });
    const msg = await ctx.reply(
      fmt`
Сессия завершена, а данные для входа удалены (если были).
Внимание: Если вы собираетесь в будующем входить в ${bold("другой")} аккаунт ссау, то вам следует сбросить данные о себе через /start
Если же вы собираетесь продолжать использовать текущий аккаут - сбрасывать ничего не нужно.
      `,
    );
    ctx.session.tempMessages.push({
      id: msg.message_id,
      deleteAfter: new Date(Date.now() + 60_000),
    });
  });

  bot.command("cancel", async (ctx) => {
    log.debug(JSON.stringify(ctx.scene.current));
    deleteTempMessages(ctx, "scene_*");
    ctx.scene.leave();
  });

  bot.command("schedule", async (ctx) => {
    ctx.session.scheduleViewer = {
      chatId: ctx.chat.id,
      message: 0,
      week: 0,
    };
    sendTimetable(ctx, 0).catch((e) => {
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

  bot.hears(/\d{4}(?:-\d+)?D?/, async (ctx) => {
    const group = await findGroupOrOptions({
      groupName: ctx.message.text.trim(),
    });
    if (!group || (Array.isArray(group) && group.length === 0)) {
      ctx.reply("Группа или похожие на неё группы на найдены");
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

  // debug command used to test error handling
  bot.command("suicide", (ctx) => {
    if (ctx.from.id === env.SCHED_BOT_ADMIN_TGID) throw new Error("Well, fuck");
    else
      ctx.reply(
        fmt`Ты. Ужасный. Человек.\n${italic('Я серьёзно, тут так и написано: "Ужасный человек"')}`,
      );
  });

  bot.on(message("text"), async (ctx) => {
    log.debug(`[ignored: message fell]`, { user: ctx.from.id });
  });

  // bot.on(message("photo"), async (ctx) => {
  //   ctx.session.messages.push({ photo: ctx.message });
  // });

  // bot.on(message("video"), async (ctx) => {
  //   ctx.session.messages.push({ video: ctx.message });
  // });
}

async function init(fastify: FastifyInstance) {
  const TOKEN = env.SCHED_BOT_TOKEN;

  await fastify.register(
    fp<{ token: string }>(
      async (fastify, opts) => {
        log.debug("Registering bot..");

        const bot = new Telegraf<Context>(opts.token);

        bot.use(
          session({
            defaultSession: getDefaultSession,
          }),
        );

        await init_bot(bot);

        fastify.decorate("bot", bot);
      },
      {
        name: "arais-sched-bot",
      },
    ),
    {
      token: TOKEN,
    },
  );

  return fastify;
}

declare module "fastify" {
  interface FastifyInstance {
    bot: Telegraf<Context>;
  }
}

export default init;
