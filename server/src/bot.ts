import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { Markup, Scenes, session, Telegraf, type SessionStore } from "telegraf";
import { message } from "telegraf/filters";
import { env } from "./env";

import { Context, Session } from "./types";
import log from "./logger";
import { db } from "./db";
import { fmt } from "telegraf/format";
import { lk } from "./lib/lk";
import { formatBigInt, getPersonShortname, getWeekFromDate } from "./lib/utils";
import { loginScene } from "./scenes/login";
import { schedule } from "./lib/schedule";
import { Message } from "telegraf/types";
import { findGroup, findGroupOrOptions } from "./lib/misc";

function getDefaultSession(): Session {
  return {
    tempMessages: [],
    sceneData: {},
    loggedIn: false,
    scheduleViewer: {
      message: 0,
      week: 0,
      groupId: undefined,
    },
  };
}

async function reset(ctx: Context, userId: number) {
  await db.user.delete({ where: { id: userId } });
}

async function start(ctx: Context, userId: number) {
  await db.user.create({ data: { id: userId } });
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
  console.log(target, event);
  if (uniqueTargets.length > 0) ctx.deleteMessages(uniqueTargets);
}

const stage = new Scenes.Stage([loginScene]);

async function sendTimetable(
  ctx: Context,
  week: number,
  opts?: { groupId?: number; ignoreCached?: boolean; forceUpdate?: boolean },
) {
  if (!ctx?.from?.id) {
    log.error(
      `Some otherwordly being requested a timetable... ${JSON.stringify(ctx)}`,
    );
    return;
  }
  if (week < 0 || week > 52) return;
  console.log(week, opts);
  const startTime = process.hrtime.bigint();
  const user = await db.user.findUnique({ where: { id: ctx.from.id } });
  const group =
    opts?.groupId ?? ctx.session.scheduleViewer.groupId ?? undefined;
  if (ctx.session.scheduleViewer.message) {
    ctx.deleteMessage(ctx.session.scheduleViewer.message);
  }

  const temp: { msg: Message.TextMessage | null } = { msg: null };
  const tempMsgTimeout = setTimeout(async () => {
    temp.msg = await ctx.reply("Создание изображения...");
  }, 100);

  const timetable = await schedule.getTimetableWithImage(user!, week, {
    groupId: group,
    forceUpdate: opts?.forceUpdate ?? undefined,
  });

  clearTimeout(tempMsgTimeout);
  if (temp.msg) {
    ctx.deleteMessage(temp.msg.message_id);
  }
  const msg = await ctx.replyWithPhoto(
    { source: timetable.image },
    Markup.inlineKeyboard([
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
    ]),
  );
  ctx.session.scheduleViewer.message = msg.message_id;
  ctx.session.scheduleViewer.week = timetable.timetable.week;
  ctx.session.scheduleViewer.groupId = timetable.timetable.groupId;

  const endTime = process.hrtime.bigint();
  log.debug(
    `[BOT] Image viewer [F:${timetable.timetable.foreignGroup} I:${timetable.timetable.withIet}] ${timetable.timetable.groupId}/${timetable.timetable.week}. Took ${formatBigInt(endTime - startTime)}ns`,
    { user: timetable.timetable.user },
  );
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

  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const existingUser = await db.user.findUnique({ where: { id: userId } });
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
    const user = await db.user.findUnique({ where: { id: ctx.from.id } })!;
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
    const user = await db.user.findUnique({ where: { id: ctx.from.id } })!;
    await lk.resetAuth(user!, { resetCredentials: true });
    const msg = await ctx.reply(
      fmt`Сессия завершена, а данные для входа удалены (если были).`,
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
    sendTimetable(ctx, 0);
  });

  bot.action("schedule_button_next", async (ctx) => {
    const week = ctx.session.scheduleViewer.week + 1;
    sendTimetable(ctx, week);
  });

  bot.action("schedule_button_prev", async (ctx) => {
    const week = ctx.session.scheduleViewer.week - 1;
    sendTimetable(ctx, week);
  });

  bot.action("schedule_button_refresh", async (ctx) => {
    const week = ctx.session.scheduleViewer.week;
    sendTimetable(ctx, week);
  });

  bot.action("schedule_button_forceupdate", async (ctx) => {
    const week = ctx.session.scheduleViewer.week;
    sendTimetable(ctx, week, { forceUpdate: true });
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
