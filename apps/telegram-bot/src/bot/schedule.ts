import { InlineKeyboard, type Bot } from "grammy"
import type { Context } from "./types"

import log from "@/bot/logger"
import {
  formatBigInt,
  formatSentence,
  getPersonShortname,
} from "@ssau-schedule/shared/utils"
import { getWeekFromDate } from "@ssau-schedule/shared/date"
import { env } from "@/bot/env"
import {
  formatLesson,
  formatTimetableDiff,
  generateTextLesson,
} from "@ssau-schedule/shared/misc"
import { getUserPreferences } from "@ssau-schedule/shared/utils"
import { handleError } from "."
import { openSettings } from "./options"
import { CommandGroup } from "@grammyjs/commands"
import { uploadScheduleImage } from "./imageUploading"
import { api } from "@/bot/serverClient"
import { getUser } from "./misc"
import type {
  TeacherTimetableWithImage,
  TimetableWithImage,
} from "@ssau-schedule/shared/timetable"

function answerCallbackQueryOrReply(ctx: Context, text: string) {
  if (ctx.callbackQuery) {
    return ctx.answerCallbackQuery(text)
  }

  if (!ctx.chat) return
  return ctx.reply(text)
}

function answerCallbackQueryIfPresent(ctx: Context, text?: string) {
  if (!ctx.callbackQuery) return
  return text ? ctx.answerCallbackQuery(text) : ctx.answerCallbackQuery()
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

export async function sendTimetable(
  ctx: Context,
  {
    week,
    groupId,
    teacherId,
    forceUpdate,
    forceNewMessage = false,
  }: {
    week: number
    groupId?: number
    teacherId?: number
    forceUpdate?: boolean
    forceNewMessage?: boolean
  },
) {
  if (
    ctx.session.startedScheduleUpdateAt &&
    Date.now() - ctx.session.startedScheduleUpdateAt.getTime() < 30_000
  ) {
    return answerCallbackQueryOrReply(
      ctx,
      "Обновление уже запущено, пожалуйста подождите.",
    )
  }
  if (!ctx.from) return
  ctx.session.startedScheduleUpdateAt = new Date()
  try {
    const userId = ctx.from.id // let
    if (ctx.chat?.type !== "private") {
      return ctx.reply(`Групповые чаты временно недоступны.`)
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
    const chat = ctx.chat
    if (!chat) {
      log.error(`No chat ID in request`, { user: userId })
      return answerCallbackQueryOrReply(
        ctx,
        "Произошла ошибка, пожалуйста используйте /schedule.",
      )
    }

    let msgId: number | null =
      ctx?.callbackQuery?.message?.message_id ??
      ctx.session.scheduleViewer.message ??
      null
    if (forceNewMessage) {
      msgId = null
    }

    const newMessageMode = !msgId

    const user = await getUser(ctx, { required: true })
    if (!user) return
    const isAuthed = !!user.authCookie
    const weekNumber = week === 0 ? 0 : Math.min(Math.max(week, 1), 52)

    const teacherMode = !!teacherId

    if (!groupId && !user.groupId && !teacherMode) {
      await answerCallbackQueryIfPresent(ctx)?.catch(() => undefined)
      return ctx.reply("За вами не закреплена группа, я не знаю какое расписание вам отправить :D\nПожалуйста настройте группу через /options или отправьте номер группы в чат")
    }

    const group = groupId
      ? (await api.group
        .id({ id: groupId ?? user.groupId! })
        .get()
        .then((res) => res.data))!
      : null

    const preferences = getUserPreferences(user)

    const logTarget = teacherMode
      ? `t${teacherId}`
      : `g${group?.id ?? user.groupId}`

    log.debug(
      `[bot.viewer] Requested schedule ${preferences.theme}/${logTarget}/${weekNumber} ${!isAuthed ? "(unauthed) " : ""}`,
      { user: userId },
    )
    const startTime = process.hrtime.bigint()

    let tempMsgPromise: Promise<unknown> | null = null
    let tempMsgId = msgId

    function updateTempMsg(text: string) {
      if (!text) return

      function requestUpdate(): Promise<unknown> {
        if (newMessageMode) {
          if (!tempMsgId) {
            return ctx.api
              .sendMessage(chat.id, text, {
                reply_markup: new InlineKeyboard(),
              })
              .then((m) => {
                tempMsgId = m.message_id
              })
          } else {
            return ctx.api.editMessageText(chat.id, tempMsgId, text, {
              reply_markup: new InlineKeyboard(),
            })
          }
        }
        return ctx.api
          .editMessageCaption(chat.id, msgId!, {
            caption: text,
            reply_markup: new InlineKeyboard(),
          })
          .catch(() => {
            /* ignore */
          })
      }

      if (tempMsgPromise) {
        tempMsgPromise = tempMsgPromise.then(() => requestUpdate())
      } else {
        tempMsgPromise = requestUpdate()
      }
    }

    let timetableData: TimetableWithImage | TeacherTimetableWithImage | null =
      null
    let error = ""

    try {
      const endpoint = teacherMode
        ? api.teacher.schedule.image.stream
        : api.schedule.image.stream

      const { data, error: reqError } = await endpoint.get({
        query: {
          userId: user?.id ?? undefined,
          week: weekNumber,
          groupId: group?.id ?? undefined,
          teacherId: teacherId! ?? undefined,
          stylemap: preferences.theme,
          forceUpdate: !!forceUpdate,
        },
      })
      if (reqError) {
        throw new Error(`API error: ${JSON.stringify(reqError)}`)
      }
      if (!data) throw new Error("No data received from API")
      if ("code" in data) {
        throw new Error(`API error ${data.code}: ${data.response}`)
      }

      log.debug(`Started receiving schedule stream`, { user: userId })

      for await (const rawchunk of data) {
        // TODO: remove this mess. See https://github.com/elysiajs/elysia/issues/1559
        const chunk = (rawchunk as unknown as { data: typeof rawchunk }).data
        if ("state" in chunk) {
          let text = ""
          const { state, message } = chunk
          switch (state) {
            case "updatingTeacher":
              text = message ?? ""
              if (teacherMode) {
                text += `\nРасписания для преподавателей могут обновляться довольно медленно.\nПожалуйста, подождите`
              }
              break
            case "updatingWeek":
              text = "Обновление расписания..."
              if (teacherMode) {
                text += `\nРасписания для преподавателей могут обновляться довольно медленно.\nПожалуйста, подождите`
              }
              break
            case "generatingTimetable":
              // text = "Генерация расписания...";
              // ignored
              break
            case "generatingImage":
              // text = "Создание изображения...";
              // ignored
              break
            case "error":
              error = message ?? "Произошла ошибка при получении расписания."
              break // prevent updateTempMsg
          }
          if (text) {
            log.debug(
              `Schedule stream update: '${state}': "${message ?? ""}"`,
              {
                user: userId,
              },
            )
            updateTempMsg(text)
          }
        } else {
          log.debug(`Received schedule data chunk`, { user: userId })
          timetableData = chunk
        }
      }

      if (!timetableData) {
        throw new Error("No timetable data received from API stream")
      }
    } catch (e) {
      log.error(`Failed to get timetable`, {
        user: userId,
        object: String(e) as unknown as object,
      })
      return ctx.reply(`
Произошла неизвестная ошибка при обновлении.
Для подробностей свяжитесь с администратором бота.
        `)
    }
    const { timetable, image } = timetableData

    const buttonsQuery =
      `schedule_button_view_` +
      (teacherMode ? `t${teacherId}` : `g${groupId ?? 0}`)

    const buttonsMarkup = new InlineKeyboard()
      .text("⬅️", `${buttonsQuery}/${timetable.week - 1}`)
      .text("🔄", `${buttonsQuery}/${timetable.week}`)
      .text("➡️", `${buttonsQuery}/${timetable.week + 1}`)
      .row()

    if (ctx?.chat?.type === "private") {
      buttonsMarkup.text("⚙️ Настройки", "open_options").row()
    }
    if (
      ctx?.chat?.type === "private" &&
      ctx?.from?.id === env.SCHED_BOT_ADMIN_TGID
    ) {
      buttonsMarkup
        .text(
          "[admin] Обновить насильно",
          `${buttonsQuery}/${timetable.week}/force`,
        )
        .row()
    }

    try {
      const currentWeek = getWeekFromDate(new Date())
      let weekNumberModifier = ""
      if (timetable.week === currentWeek) weekNumberModifier = " (текущая)"
      else if (timetable.week === currentWeek + 1)
        weekNumberModifier = " (следующая)"
      else if (timetable.week === currentWeek - 1)
        weekNumberModifier = " (предыдущая)"

      const captionLines = [
        `📆 ${timetable.week} неделя${weekNumberModifier}`,
        group ? `👥 ${group.name}` : "",
        teacherMode && "teacherName" in timetable
          ? `👤 ${getPersonShortname(timetable.teacherName ?? "Неизвестный Преподаватель")}`
          : "",
        error ? `⚠️ ${error}` : "",
        timetable.diff
          ? `📝 Изменения в расписании!\n${formatTimetableDiff(timetable.diff, "short", 8)}`
          : "",
      ].filter(Boolean)

      let caption = captionLines.join("\n")

      if (caption.length > 1024) {
        caption = caption.slice(0, 1020) + " ..."
      }

      async function sendPhoto(media: string) {
        if (tempMsgPromise) await tempMsgPromise.catch(() => undefined)
        if (newMessageMode) {
          return ctx.api
            .sendPhoto(chat.id, media, {
              caption,
              reply_markup: buttonsMarkup,
            })
            .then((m) => {
              msgId = m.message_id
              if (!tempMsgId) return
              ctx.api.deleteMessage(chat.id, tempMsgId).catch(() => {
                log.warn(`Failed to delete temporary msg`, {
                  user: userId,
                })
              })
            })
        } else {
          return ctx.api.editMessageMedia(
            chat.id,
            msgId!,
            {
              type: "photo",
              media,
              caption,
            },
            { reply_markup: buttonsMarkup },
          )
        }
      }

      if (image.tgId) {
        log.debug("Image has tgId, sending by tgId", { user: userId })
        await sendPhoto(image.tgId)
      } else {
        log.debug("Image has no tgId, will upload new", { user: userId })

        updateTempMsg(
          `Отправка изображения...\n(это может занять некоторое время, пожалуйста подождите. Во всём винить РКН)`,
        )

        const uploadCaption = `requested by ${userId} for #${"weekId" in timetable ? timetable.weekId : `t${teacherId}`}\n${image.timetableHash}/${image.stylemap} (${newMessageMode ? "new" : "upd"})`
        const uploaded = await uploadScheduleImage({
          api: ctx.api,
          image: {
            ...image,
            data: Buffer.from(image.data, "base64"),
          },
          caption: uploadCaption,
          userId,
          onFallbackAttempt: () => {
            updateTempMsg(
              `Произошла ошибка при отправке. Пробуем другим способом...\n(это может занять некоторое время, пожалуйста подождите. Во всём винить РКН)`,
            )
          },
        })

        await sendPhoto(uploaded.fileId)
      }
    } catch (error) {
      log.debug(`Error: unchanged or errored. Ignoring.`, {
        user: userId,
        object: error as object,
      })
      await answerCallbackQueryOrReply(ctx, "Ничего не изменилось")
    }
    const endTime = process.hrtime.bigint()
    log.debug(
      `[bot] Image viewer update ${image.stylemap}/${logTarget}/${timetable.week}. Took ${formatBigInt(endTime - startTime)}ns`,
      { user: userId },
    )

    Object.assign(ctx.session.scheduleViewer, {
      message: msgId,
      chatId: chat.id,
      week: timetable.week,
      mode: teacherMode ? "teacher" : "group",
      groupId: group?.id ?? undefined,
      teacherId: teacherId ?? undefined,
    })
  } catch (e) {
    log.error(`Failed to update timetable msg`, {
      user: ctx?.from?.id,
      object: String(e) as unknown as object,
    })
    return answerCallbackQueryOrReply(ctx, "Произошла ошибка при обновлении.")
  } finally {
    ctx.session.startedScheduleUpdateAt = null
  }
}

async function sendSelector(
  ctx: Context,
  items: { id: number; name: string }[],
  mode: "group" | "teacher",
) {
  const keyboard = new InlineKeyboard()
  const callback = `schedule_button_view_${mode[0]}`
  for (let i = 0; i < items.length; i++) {
    if (i % 3 === 0 && i !== 0) keyboard.row()
    const item = items[i]
    keyboard.text(item.name, `${callback}${item.id}/0`)
  }
  const replyText = `Найдены следующие ${mode === "group" ? "группы" : "преподаватели"}:`
  return ctx.reply(replyText, { reply_markup: keyboard })
}

export const scheduleCommands = new CommandGroup<Context>()

export async function initSchedule(bot: Bot<Context>) {
  const commands = scheduleCommands

  commands.command("schedule", "Расписание", async (ctx) => {
    if (!ctx.from || !ctx.message) return
    ctx.session.scheduleViewer = {
      chatId: ctx.chat.id,
      message: 0,
      week: 0,
      mode: "group",
    }
    const group = /^.* (\d{4}(?:-\d*)?D?)(?: \d+)?$/
      .exec(ctx.message.text)
      ?.at(1)
    const groupIds = group
      ? await api.ssau.findGroupOrOptions
        .get({ query: { name: group } })
        .then((res) => res.data)
        .catch(() => null)
      : undefined
    let groupId: number | undefined = undefined
    if (group || groupIds) {
      if (
        groupIds === null ||
        (Array.isArray(groupIds) && groupIds.length === 0)
      ) {
        return ctx.reply(`Группа "${group}" не найдена`)
      } else if (Array.isArray(groupIds)) {
        if (groupIds.length === 1) groupId = groupIds[0].id
        else return sendSelector(ctx, groupIds, "group")
      }
    }
    const weekArg = /^.* (\d+)(?: .*)?$/.exec(ctx.message.text)?.at(1) ?? "nan"
    let week = 0
    if (weekArg && !Number.isNaN(Number(weekArg.trim()))) week = Number(weekArg)

    // if (!groupId && ctx.chat.type !== "private") {
    //   return sendGroupTimetable(ctx, week);
    // }
    sendTimetable(ctx, {
      week,
      groupId,
    }).catch((e) => {
      return handleError(ctx, e as Error)
    })
  })

  bot.callbackQuery(
    /schedule_button_view_([gt])(\d+)\/(\d+)(\/force)?/,
    async (ctx) => {
      const match = ctx.match
      if (!match || match.length < 2) return ctx.answerCallbackQuery("Ошибка")
      const mode = match[1] as "g" | "t"
      const id = Number(match[2])
      const week = Number(match[3])
      const forceUpdate = Boolean(match[4])
      if (Number.isNaN(week) || Number.isNaN(id)) {
        log.warn(
          `Invalid view request: ${typeof ctx.match === "string" ? ctx.match : ctx.match.join()}`,
          {
            user: ctx.from.id,
          },
        )
        return ctx.answerCallbackQuery("Ошибка: Неверный запрос")
      }
      sendTimetable(ctx, {
        week,
        groupId: mode === "g" ? id : undefined,
        teacherId: mode === "t" ? id : undefined,
        forceUpdate,
      }).catch((e) => {
        return handleError(ctx, e as Error)
      })
    },
  )

  bot.callbackQuery("open_options", (ctx) => {
    if (ctx.chat?.type !== "private") {
      return ctx.reply("Настройки доступны только в личном чате")
    }
    void ctx.answerCallbackQuery()
    return openSettings(ctx)
  })

  commands.command(
    "today",
    "Расписание на сегодня (с ссылками на пары)",
    async (ctx) => {
      if (!ctx.from || !ctx.message) return
      const user = await getUser(ctx, { required: true })
      if (!user) return
      if (!user.groupId) {
        return ctx.reply("За вами не закреплена группа, я не знаю какое расписание вам отправить :D\nПожалуйста настройте группу через /options")
      }
      const now = new Date()
      const timetable = (await api.schedule.json
        .get({ query: { userId: user.id, week: 0 } })
        .then((res) => res?.data))
      if (!timetable) {
        log.error(`Failed to get timetable for today`, { user: ctx.from.id })
        return ctx.reply(`Произошла ошибка при получении расписания.`)
      }
      const day = timetable.days.at(now.getDay() - 1)

      if (
        ctx.message.text.split(" ")[1] === "admin" &&
        ctx.from.id === env.SCHED_BOT_ADMIN_TGID
      ) {
        return ctx.reply(JSON.stringify(day, undefined, 2), {
          link_preview_options: { is_disabled: true },
        })
      }

      if (!day?.lessons.length || now.getDay() === 0) {
        return ctx.reply("Сегодня занятий нет :D")
      }
      return ctx.reply(
        `\
Занятия сегодня:

${day.lessons.map(generateTextLesson).join("\n-----\n")}
`,
        { link_preview_options: { is_disabled: true } },
      )
    },
  )

  // day.month as an alternative to /today
  bot.hears(/^(\d\d?)[\.\/-](\d?\d?)/, async (ctx) => {
    if (!ctx.from || !ctx.message) return
    const user = await getUser(ctx, { required: true })
    if (!user) return
    if (!user.groupId) {
      return ctx.reply("За вами не закреплена группа, я не знаю какое расписание вам отправить :D\nПожалуйста настройте группу через /options")
    }
    const match = ctx.match
    if (!match || match.length < 3) return ctx.reply("Ошибка: неверный формат даты")
    const now = new Date()
    const day = Number(match[1])
    const month = Number(match[2]) || now.getMonth() + 1
    if (Number.isNaN(day) || Number.isNaN(month)) {
      return ctx.reply("Ошибка: неверный формат даты")
    }
    const date = new Date(now.getFullYear(), month - 1, day)
    const dateStr = date.toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
    })
    const week = getWeekFromDate(date, { unclamped: true })
    if (week < 1 || week > 52) {
      return ctx.reply(`Вне учебного года пар уж точно нет :D\n(Неделя ${week})`)
    }
    //return sendTimetable(ctx, { week })
    const timetable = (await api.schedule.json
      .get({ query: { userId: user.id, week } })
      .then((res) => res?.data))
    if (!timetable) {
      log.error(`Failed to get timetable for week ${week}`, { user: ctx.from.id })
      return ctx.reply(`Произошла ошибка при получении расписания.`)
    }
    const daySchedule = timetable.days.at(date.getDay() - 1)
    const args = ctx.message.text!.split(" ").slice(1)
    if (
      args.includes("admin") &&
      ctx.from.id === env.SCHED_BOT_ADMIN_TGID
    ) {
      let msg = JSON.stringify(daySchedule, undefined, 2)
      while (msg.length > 1000) {
        await ctx.reply(msg.slice(0, 1000), {
          link_preview_options: { is_disabled: true },
        })
        msg = msg.slice(1000)
      }
      return ctx.reply(msg, {
        link_preview_options: { is_disabled: true },
      })
    }

    if (args.includes("week")) {
      return sendTimetable(ctx, { week })
    }

    if (!daySchedule?.lessons.length) {
      return ctx.reply(`${dateStr} (Неделя ${week}): занятий нет :D`)
    }

    return ctx.reply(
      `\
${dateStr} (Неделя ${week}):

${daySchedule.lessons.map(generateTextLesson).join("\n-----\n")}
`,
      { link_preview_options: { is_disabled: true } },
    )
  })

  commands.command("now", "Ближайшая пара", async (ctx) => {
    if (!ctx.from || !ctx.message) return
    const user = await getUser(ctx, { required: true })
    if (!user) return
    if (!user.groupId) {
      return ctx.reply("За вами не закреплена группа, я не знаю какое расписание вам отправить :D\nПожалуйста настройте группу через /options")
    }
    const now = new Date()
    const timetable = (await api.schedule.json
      .get({ query: { userId: user.id, week: 0 } })
      .then((res) => res?.data))
    if (!timetable) {
      log.error(`Failed to get timetable for now`, { user: ctx.from.id })
      return ctx.reply(`Произошла ошибка при получении расписания.`)
    }
    const day = timetable.days.at(now.getDay() - 1)
    if (!day?.lessons.length || now.getDay() === 0) {
      return ctx.reply("Сегодня занятий нет :D")
    }
    const lesson = day.lessons.find((l) => l.endTime > now)
    if (!lesson) {
      return ctx.reply("На сегодня занятия закончились :D")
    }
    return ctx.reply(
      `\
${lesson.beginTime > now ? "Сейчас будет:" : "Сейчас идёт:"}

${generateTextLesson(lesson)}
`,
      { link_preview_options: { is_disabled: true } },
    )
  })

  commands.command("exams", "Ближайшие экзамены", async (ctx) => {
    if (!ctx.from || !ctx.message) return
    const user = await getUser(ctx, { required: true })
    if (!user) return
    if (!user.groupId) {
      return ctx.reply("За вами не закреплена группа, я не знаю какое расписание вам отправить :D\nПожалуйста настройте группу через /options")
    }

    // Exams and Consultations
    const exams = await api.schedule.exams
      .get({ query: { userId: user.id, includeConsultations: true } })
      .then((res) => res.data)

    if (!exams || exams.length === 0) {
      return ctx.reply(
        "Экзамены не найдены :D\nВозможно их ещё не добавили в расписание.",
      )
    }

    const lines: string[] = []

    function formatDate(d: Date) {
      return formatSentence(
        d.toLocaleDateString("ru-RU", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
        }),
      )
    }

    const now = new Date()
    const lastPassedExamIndex = exams.findLastIndex(
      (e) => new Date(e.endTime) < now && e.type === "Exam",
    )
    if (lastPassedExamIndex > 0) {
      const items = exams
        .slice(0, lastPassedExamIndex + 1)
        .filter((e) => e.type === "Exam")
      lines.push("Прошедшие экзамены:\n")
      items.map((l) =>
        lines.push(`<b>${l.discipline}</b> (${formatDate(l.beginTime)})`),
      )
      lines.push("-----")
    }

    let currentExamDiscipline = ""
    const upcomingExams = exams.slice(
      lastPassedExamIndex > 0 ? lastPassedExamIndex + 1 : 0,
    )
    if (upcomingExams.length === 0) {
      lines.push("Предстоящих экзаменов нет :D")
    } else {
      lines.push("Предстоящие экзамены:")
    }
    for (const l of upcomingExams) {
      if (l.discipline !== currentExamDiscipline) {
        lines.push(`\n<b>${l.discipline}</b>`)
        currentExamDiscipline = l.discipline
      }
      lines.push(
        formatLesson(l, {
          nameOverride: `${l.type === "Consult" ? "Консультация" : "Экзамен"}`,
          showSubgroup: true,
        }),
      )
    }

    return ctx.reply(lines.join("\n"), {
      link_preview_options: { is_disabled: true },
      parse_mode: "HTML",
    })
  })

  // 0 - 99 as a week number
  bot.hears(/^\d\d?$/, async (ctx) => {
    if (!ctx.from || !ctx.message || !ctx.message.text) return
    if (ctx.chat?.type !== "private") {
      return
    }
    const text = ctx.message.text.trim()
    const week = parseInt(text)
    void ctx.api
      .deleteMessage(ctx.message.chat.id, ctx.message.message_id)
      .catch()

    if (ctx.session.scheduleViewer.message) {
      return sendTimetable(ctx, {
        week,
        groupId: ctx.session.scheduleViewer.groupId ?? undefined,
        teacherId: ctx.session.scheduleViewer.teacherId ?? undefined,
      })
    }
    return sendTimetable(ctx, { week })
  })

  // 6101(-090301)?D? as a group number
  bot.hears(/^\d{4}(?:-\d*)?D?$/, async (ctx) => {
    if (!ctx.from || !ctx.message || !ctx.message.text) return
    if (ctx.chat?.type !== "private") {
      return
    }

    // Check server connectivity and that user exists
    const user = await getUser(ctx, { required: true })
    if (!user) return

    const groups = await api.ssau.findGroupOrOptions
      .get({ query: { name: ctx.message.text.trim() } })
      .then((res) => res.data)
      .catch(() => null)
    if (!groups || (Array.isArray(groups) && groups.length === 0)) {
      return ctx.reply("Группа или похожие на неё группы не найдены")
    }
    if (Array.isArray(groups)) {
      void ctx.deleteMessage().catch(() => {
        /* ignore */
      })
      log.debug(
        `Found ${groups.length} groups matching "${ctx.message.text.trim()}"`,
        {
          user: ctx.from.id,
        },
      )
      if (groups.length === 1) {
        return sendTimetable(ctx, { week: 0, groupId: groups[0].id })
      } else {
        return sendSelector(ctx, groups, "group")
      }
    }
  })

  // Bot hears a teacher's name (1-3 words cyrillic)
  bot.hears(/^([а-яА-ЯёЁ]{3,}) ?([а-яА-ЯёЁ]+ ?){0,2}$/, async (ctx) => {
    if (!ctx.from || !ctx.message || !ctx.message.text) return
    if (ctx.chat?.type !== "private") {
      return
    }

    const user = await getUser(ctx, { required: true })
    if (!user) return

    const teachers = await api.ssau.findTeacherOrOptions
      .get({ query: { name: ctx.message.text.trim() } })
      .then((res) => res.data)
      .catch(() => null)
    if (!teachers || (Array.isArray(teachers) && teachers.length === 0)) {
      return ctx.reply(
        "Преподаватель с таким именем не найден\nПопробуйте ввести фамилию или фамилию и имя\nПример: 'Иванов' или 'Иванов Иван'",
      )
    }
    if (Array.isArray(teachers)) {
      void ctx.deleteMessage().catch(() => {
        /* ignore */
      })
      log.debug(
        `Found ${teachers.length} teachers matching "${ctx.message.text.trim()}"`,
        {
          user: ctx.from.id,
        },
      )
      if (teachers.length === 1) {
        return sendTimetable(ctx, {
          week: 0,
          teacherId: teachers[0].id,
        })
      } else {
        teachers.map((t) => (t.name = getPersonShortname(t.name)))
        return sendSelector(ctx, teachers, "teacher")
      }
    }
  })

  commands.command("ics", "Ссылка на календарь ics", async (ctx) => {
    if (ctx.chat.type !== "private") return
    if (!ctx.from) {
      return ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
        parse_mode: "HTML",
      })
    }
    const user = await getUser(ctx, { required: true })
    if (!user) return
    const cal = await api.user
      .id({ id: user.id })
      .ics.get()
      .then((res) => res.data)
      .catch(() => null)
    if (!cal) {
      return ctx.reply(
        `Произошла ошибка при попытке создать календарь.\nПожалуйста попробуйте позже или свяжитесь с администратором бота`,
      )
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
    )
  })

  bot.use(commands)
  return commands
}
