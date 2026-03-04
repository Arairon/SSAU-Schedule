import {
  InlineKeyboard,
  type Bot,
  type Context as GrammyContext,
} from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";

import type { Context } from "../types";
import { db } from "@/db";
import log from "@/logger";
import { lk } from "@/ssau/lk";
import { findGroupOrOptions } from "@/ssau/search";
import { getUserPreferences } from "@/lib/misc";
import { stylemaps } from "@ssau-schedule/shared/themes/index";
import { getPersonShortname } from "@ssau-schedule/shared/utils";

const ONBOARD_CANCEL = "onboard_cancel";
const ONBOARD_MODE_AUTHED = "onboard_mode_authed";
const ONBOARD_MODE_UNAUTHED = "onboard_mode_unauthed";

const ONBOARD_GROUP_KEEP_LK = "onboard_group_keep_lk";
const ONBOARD_GROUP_CHANGE = "onboard_group_change";
const ONBOARD_GROUP_SELECT_PREFIX = "onboard_group_select_";

const ONBOARD_THEME_PREFIX = "onboard_theme_";

const ONBOARD_SUBGROUP_BOTH = "onboard_subgroup_0";
const ONBOARD_SUBGROUP_1 = "onboard_subgroup_1";
const ONBOARD_SUBGROUP_2 = "onboard_subgroup_2";

const ONBOARD_NOTIFY_ENABLE = "onboard_notify_enable";
const ONBOARD_NOTIFY_DISABLE = "onboard_notify_disable";

const ONBOARD_PROXY_ALLOW = "onboard_proxy_allow";
const ONBOARD_PROXY_DENY = "onboard_proxy_deny";

const ONBOARD_LOGIN_SAVE = "onboard_login_save";
const ONBOARD_LOGIN_DONTSAVE = "onboard_login_dontsave";

const notificationDefaults = {
  notifyBeforeLessons: 30 * 60,
  notifyAboutNextLesson: true,
  notifyAboutNextDay: true,
  notifyAboutNextWeek: true,
};

function getCallbackData(update: GrammyContext): string | null {
  if (update.callbackQuery && "data" in update.callbackQuery) {
    return update.callbackQuery.data ?? null;
  }
  return null;
}

function getMessageText(update: GrammyContext): string | null {
  if (update.message && "text" in update.message && update.message.text) {
    return update.message.text.trim();
  }
  return null;
}

async function cancelOnboarding(
  ctx: GrammyContext,
  chatId: number,
  msgId: number,
) {
  await ctx.api
    .editMessageText(
      chatId,
      msgId,
      "Онбординг отменён. Вы можете начать заново в любой момент через /start",
    )
    .catch();
}

async function setUserGroupById(userId: number, groupId: number) {
  const now = new Date();
  const user = await db.user.update({
    where: { id: userId },
    data: {
      groupId,
      lastActive: now,
      ics: {
        upsert: {
          create: { validUntil: now },
          update: { validUntil: now },
        },
      },
    },
    include: { group: true },
  });
  await db.week.updateMany({
    where: { owner: userId },
    data: { cachedUntil: now },
  });
  return user;
}

async function askMode(
  conversation: Conversation,
  ctx: GrammyContext,
  msg: { chat: { id: number }; message_id: number },
): Promise<"authed" | "unauthed" | null> {
  const proxyUserExists = await conversation.external(() => {
    return db.user.findFirst({ where: { allowsAccountProxyUse: true } });
  });

  const keyboard = new InlineKeyboard()
    .text("С входом в ЛК", ONBOARD_MODE_AUTHED)
    .row();
  if (proxyUserExists) {
    keyboard.text("Без входа", ONBOARD_MODE_UNAUTHED).row();
  }

  keyboard.text("Отмена", ONBOARD_CANCEL);

  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    `\
Выберите режим:
• С входом в ЛК (с поддержкой ИОТов)
${
  proxyUserExists
    ? "• Без входа (анонимно)"
    : "\nАнонимный вход недоступен (нет пользователей, разрешивших использовать их аккаунт для прокси-запросов)"
}

Для отмены: /cancel`,
    {
      reply_markup: keyboard,
    },
  );

  while (true) {
    const update = await conversation.wait();
    const text = getMessageText(update);
    if (text === "/cancel") return null;

    const data = getCallbackData(update);
    if (!data) continue;

    await update.answerCallbackQuery().catch();

    if (data === ONBOARD_CANCEL) return null;
    if (data === ONBOARD_MODE_AUTHED) return "authed";
    if (data === ONBOARD_MODE_UNAUTHED) return "unauthed";
  }
}

async function promptForText(
  conversation: Conversation,
  ctx: GrammyContext,
  msg: { chat: { id: number }; message_id: number },
  prompt: string,
): Promise<string | null> {
  await ctx.api.editMessageText(msg.chat.id, msg.message_id, prompt);

  while (true) {
    const input = await conversation.waitFor("message:text");
    const text = input.message.text?.trim();
    if (!text) continue;

    await input.api
      .deleteMessage(input.chat.id, input.message.message_id)
      .catch();

    if (text === "/cancel") return null;
    return text;
  }
}

async function runLkLogin(
  conversation: Conversation,
  ctx: GrammyContext,
  msg: { chat: { id: number }; message_id: number },
  userId: number,
) {
  const user = await conversation.external(() =>
    db.user.findUnique({ where: { id: userId } }),
  );
  if (!user) return { ok: false as const, cancelled: false as const };

  const username = await promptForText(
    conversation,
    ctx,
    msg,
    `\
Вход в личный кабинет
Введите логин:
`,
  );
  if (!username) return { ok: false as const, cancelled: true as const };

  const initialPassword = await promptForText(
    conversation,
    ctx,
    msg,
    `\
Вход в личный кабинет
Логин: ${username}
Введите пароль:
    `,
  );
  if (!initialPassword) return { ok: false as const, cancelled: true as const };
  let password: string = initialPassword;

  let loginResult = await conversation.external(() =>
    lk.login(user, { username, password }),
  );

  while (!loginResult.ok) {
    const nextPassword = await promptForText(
      conversation,
      ctx,
      msg,
      `\
Вход в ЛК
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Ошибка входа: ${loginResult.error}: ${loginResult.message ?? "Неизвестная ошибка"}
Попробуйте ввести пароль снова или отмените вход через /cancel`,
    );
    if (!nextPassword) return { ok: false as const, cancelled: true as const };
    password = nextPassword;

    await ctx.api
      .editMessageText(
        msg.chat.id,
        msg.message_id,
        `\
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Пробуем войти...
    `,
      )
      .catch();

    loginResult = await conversation.external(() =>
      lk.login(user, { username, password }),
    );
  }

  const userInfoResult = await conversation.external(() =>
    lk.updateUserInfo(user, { overrideGroup: true }),
  );
  if (!userInfoResult.ok) {
    return { ok: false as const, cancelled: false as const };
  }

  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    `
Вход в личный кабинет
Логин: ${username}
Пароль: \*\*\*\*\*\*\*\*
Вход успешен! ${userInfoResult.data?.fullname ? `Вы вошли как '${getPersonShortname(userInfoResult.data.fullname)}'` : ``}
Сохранить данные для входа в базе данных?
(Данные хранятся в зашифрованном виде и используются только если ЛК по той или иной причине прервёт сессию. Сохранять данные необязательно)
    `,
    {
      reply_markup: new InlineKeyboard()
        .text("❌ Нет", ONBOARD_LOGIN_DONTSAVE)
        .text("✅ Да", ONBOARD_LOGIN_SAVE)
        .row()
        .text("Отмена", ONBOARD_CANCEL),
    },
  );

  while (true) {
    const update = await conversation.wait();
    const text = getMessageText(update);
    if (text === "/cancel")
      return { ok: false as const, cancelled: true as const };

    const data = getCallbackData(update);
    if (!data) continue;
    await update.answerCallbackQuery().catch();

    if (data === ONBOARD_CANCEL) {
      return { ok: false as const, cancelled: true as const };
    }
    if (data === ONBOARD_LOGIN_SAVE) {
      await conversation.external(() =>
        lk.saveCredentials(userId, { username, password }),
      );
      return { ok: true as const, savedCredentials: true as const };
    }
    if (data === ONBOARD_LOGIN_DONTSAVE) {
      return { ok: true as const, savedCredentials: false as const };
    }
  }
}

async function askAuthedGroupMode(
  conversation: Conversation,
  ctx: GrammyContext,
  msg: { chat: { id: number }; message_id: number },
  lkGroupName: string,
): Promise<"keep" | "choose" | null> {
  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    `Группа из ЛК: ${lkGroupName}\n\nОставить эту группу или выбрать другую?`,
    {
      reply_markup: new InlineKeyboard()
        .text("Оставить группу из ЛК", ONBOARD_GROUP_KEEP_LK)
        .row()
        .text("Выбрать другую", ONBOARD_GROUP_CHANGE)
        .row()
        .text("Отмена", ONBOARD_CANCEL),
    },
  );

  while (true) {
    const update = await conversation.wait();
    const text = getMessageText(update);
    if (text === "/cancel") return null;

    const data = getCallbackData(update);
    if (!data) continue;
    await update.answerCallbackQuery().catch();

    if (data === ONBOARD_CANCEL) return null;
    if (data === ONBOARD_GROUP_KEEP_LK) return "keep";
    if (data === ONBOARD_GROUP_CHANGE) return "choose";
  }
}

function getGroupsKeyboard(groups: { id: number; name: string }[]) {
  const keyboard = new InlineKeyboard();
  groups.slice(0, 9).forEach((group, index) => {
    keyboard.text(group.name, `${ONBOARD_GROUP_SELECT_PREFIX}${group.id}`);
    if ((index + 1) % 3 === 0) keyboard.row();
  });
  if (groups.length % 3 !== 0) keyboard.row();
  keyboard.text("Отмена", ONBOARD_CANCEL);
  return keyboard;
}

async function chooseGroupManually(
  conversation: Conversation,
  ctx: GrammyContext,
  msg: { chat: { id: number }; message_id: number },
  userId: number,
) {
  let selectableGroups: { id: number; name: string }[] = [];

  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    "Выбор группы\n\nВведите полное или частичное название группы (например: 6101-090301D).\nДля отмены: /cancel",
    {
      reply_markup: new InlineKeyboard().text("Отмена", ONBOARD_CANCEL),
    },
  );

  while (true) {
    const update = await conversation.wait();
    const text = getMessageText(update);
    const data = getCallbackData(update);

    if (text === "/cancel") return null;
    if (data === ONBOARD_CANCEL) {
      await update.answerCallbackQuery().catch();
      return null;
    }

    if (data?.startsWith(ONBOARD_GROUP_SELECT_PREFIX)) {
      await update.answerCallbackQuery().catch();
      const groupId = Number(data.slice(ONBOARD_GROUP_SELECT_PREFIX.length));
      if (Number.isNaN(groupId) || groupId <= 0) continue;

      const selected = selectableGroups.find((group) => group.id === groupId);
      if (!selected) continue;

      const updated = await conversation.external(() =>
        setUserGroupById(userId, selected.id),
      );
      return updated.group;
    }

    if (!text) continue;

    if (update.chat && update.message) {
      await update.api
        .deleteMessage(update.chat.id, update.message.message_id)
        .catch(() => {
          /* ignore */
        });
    }

    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `Ищем группу по запросу '${text}'...`,
      {
        reply_markup: new InlineKeyboard().text("Отмена", ONBOARD_CANCEL),
      },
    );

    const groups = await conversation.external(() =>
      findGroupOrOptions({ groupName: text }),
    );

    if (!groups || (Array.isArray(groups) && groups.length === 0)) {
      selectableGroups = [];
      await ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        "Группа не найдена. Попробуйте другой запрос.",
        {
          reply_markup: new InlineKeyboard().text("Отмена", ONBOARD_CANCEL),
        },
      );
      continue;
    }

    if (!Array.isArray(groups)) {
      const updated = await conversation.external(() =>
        setUserGroupById(userId, groups.id),
      );
      return updated.group;
    }

    if (groups.length === 1) {
      const updated = await conversation.external(() =>
        setUserGroupById(userId, groups[0].id),
      );
      return updated.group;
    }

    selectableGroups = groups.slice(0, 9).map((group) => ({
      id: group.id,
      name: group.name,
    }));

    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      "Найдено несколько групп. Выберите нужную кнопкой ниже или уточните запрос.",
      {
        reply_markup: getGroupsKeyboard(selectableGroups),
      },
    );
  }
}

function getThemesKeyboard() {
  const keyboard = new InlineKeyboard();
  Object.values(stylemaps).forEach((theme) => {
    keyboard
      .text(theme.description, `${ONBOARD_THEME_PREFIX}${theme.name}`)
      .row();
  });
  keyboard.text("Отмена", ONBOARD_CANCEL);
  return keyboard;
}

async function askTheme(
  conversation: Conversation,
  ctx: GrammyContext,
  msg: { chat: { id: number }; message_id: number },
): Promise<string | null> {
  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    "Быстрые настройки\n\n2/3: Выберите тему",
    { reply_markup: getThemesKeyboard() },
  );

  while (true) {
    const update = await conversation.wait();
    const text = getMessageText(update);
    if (text === "/cancel") return null;

    const data = getCallbackData(update);
    if (!data) continue;

    await update.answerCallbackQuery().catch();

    if (data === ONBOARD_CANCEL) return null;
    if (!data.startsWith(ONBOARD_THEME_PREFIX)) continue;

    const themeName = data.slice(ONBOARD_THEME_PREFIX.length);
    if (!stylemaps[themeName]) continue;
    return themeName;
  }
}

async function askSubgroup(
  conversation: Conversation,
  ctx: GrammyContext,
  msg: { chat: { id: number }; message_id: number },
): Promise<number | null> {
  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    "Быстрые настройки\n\n1/3: Выберите подгруппу",
    {
      reply_markup: new InlineKeyboard()
        .text("Обе", ONBOARD_SUBGROUP_BOTH)
        .text("Первая", ONBOARD_SUBGROUP_1)
        .text("Вторая", ONBOARD_SUBGROUP_2)
        .row()
        .text("Отмена", ONBOARD_CANCEL),
    },
  );

  while (true) {
    const update = await conversation.wait();
    const text = getMessageText(update);
    if (text === "/cancel") return null;

    const data = getCallbackData(update);
    if (!data) continue;

    await update.answerCallbackQuery().catch();

    if (data === ONBOARD_CANCEL) return null;
    if (data === ONBOARD_SUBGROUP_BOTH) return 0;
    if (data === ONBOARD_SUBGROUP_1) return 1;
    if (data === ONBOARD_SUBGROUP_2) return 2;
  }
}

async function askNotifications(
  conversation: Conversation,
  ctx: GrammyContext,
  msg: { chat: { id: number }; message_id: number },
): Promise<boolean | null> {
  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    `\
Быстрые настройки

3/3: Включить уведомления?

Если включить, будут применены следующие настройки:
• Перед началом занятий: 30 мин
• О следующей паре: вкл
• О следующем дне: вкл
• О следующей неделе: вкл

Позже это можно изменить через /options`,
    {
      reply_markup: new InlineKeyboard()
        .text("✅ Включить", ONBOARD_NOTIFY_ENABLE)
        .text("❌ Отключить", ONBOARD_NOTIFY_DISABLE)
        .row()
        .text("Отмена", ONBOARD_CANCEL),
    },
  );

  while (true) {
    const update = await conversation.wait();
    const text = getMessageText(update);
    if (text === "/cancel") return null;

    const data = getCallbackData(update);
    if (!data) continue;

    await update.answerCallbackQuery().catch();

    if (data === ONBOARD_CANCEL) return null;
    if (data === ONBOARD_NOTIFY_ENABLE) return true;
    if (data === ONBOARD_NOTIFY_DISABLE) return false;
  }
}

async function askProxyPermission(
  conversation: Conversation,
  ctx: GrammyContext,
  msg: { chat: { id: number }; message_id: number },
): Promise<boolean | null> {
  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    `\
Разрешить использовать ваш аккаунт для анонимных запросов?

Это позволит другим пользователям, которые не вошли в ЛК, получать расписание из API личного кабинета через ваш аккаунт. \
Ваши данные не будут видны други пользователям, а на вашем аккаунте не будет выполняться никаких действий, кроме получения расписания.
`,
    {
      reply_markup: new InlineKeyboard()
        .text("✅ Разрешить", ONBOARD_PROXY_ALLOW)
        .text("❌ Запретить", ONBOARD_PROXY_DENY)
        .row()
        .text("Отмена", ONBOARD_CANCEL),
    },
  );

  while (true) {
    const update = await conversation.wait();
    const text = getMessageText(update);
    if (text === "/cancel") return null;

    const data = getCallbackData(update);
    if (!data) continue;

    await update.answerCallbackQuery().catch();

    if (data === ONBOARD_CANCEL) return null;
    if (data === ONBOARD_PROXY_ALLOW) return true;
    if (data === ONBOARD_PROXY_DENY) return false;
  }
}

async function onboardingConversation(
  conversation: Conversation,
  ctx: GrammyContext,
) {
  const tgUserId = ctx.from?.id;
  if (!tgUserId) {
    return ctx.reply(`У вас нет ID пользователя. <i>Что вы такое..?</i>`, {
      parse_mode: "HTML",
    });
  }

  const user = await conversation.external(() =>
    db.user.findUnique({
      where: { tgId: tgUserId },
      include: { group: true },
    }),
  );
  if (!user) {
    return ctx.reply(
      "Вас не существует в базе данных. Пожалуйста пропишите /start",
    );
  }

  log.debug("Running onboarding conversation", { user: tgUserId });

  const msg = await ctx.reply("Приветствую!");

  const mode = await askMode(conversation, ctx, msg);
  if (!mode) {
    await cancelOnboarding(ctx, msg.chat.id, msg.message_id);
    return;
  }

  if (mode === "authed") {
    const loginResult = await runLkLogin(conversation, ctx, msg, user.id);
    if (!loginResult.ok) {
      if (loginResult.cancelled) {
        await cancelOnboarding(ctx, msg.chat.id, msg.message_id);
      } else {
        await ctx.api.editMessageText(
          msg.chat.id,
          msg.message_id,
          "Не удалось завершить вход в ЛК. Вы можете повторить /start или использовать режим без входа.",
        );
      }
      return;
    }
  }

  const actualUser = await conversation.external(() =>
    db.user.findUnique({ where: { id: user.id }, include: { group: true } }),
  );
  if (!actualUser) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      "Не удалось получить пользователя из базы. Попробуйте снова через /start",
    );
    return;
  }

  if (mode === "authed" && actualUser.group) {
    const groupMode = await askAuthedGroupMode(
      conversation,
      ctx,
      msg,
      actualUser.group.name,
    );
    if (!groupMode) {
      await cancelOnboarding(ctx, msg.chat.id, msg.message_id);
      return;
    }
    if (groupMode === "choose") {
      const selectedGroup = await chooseGroupManually(
        conversation,
        ctx,
        msg,
        user.id,
      );
      if (!selectedGroup) {
        await cancelOnboarding(ctx, msg.chat.id, msg.message_id);
        return;
      }
    }
  } else {
    const selectedGroup = await chooseGroupManually(
      conversation,
      ctx,
      msg,
      user.id,
    );
    if (!selectedGroup) {
      await cancelOnboarding(ctx, msg.chat.id, msg.message_id);
      return;
    }
  }

  const subgroup = await askSubgroup(conversation, ctx, msg);
  if (subgroup === null) {
    await cancelOnboarding(ctx, msg.chat.id, msg.message_id);
    return;
  }

  const theme = await askTheme(conversation, ctx, msg);
  if (!theme) {
    await cancelOnboarding(ctx, msg.chat.id, msg.message_id);
    return;
  }

  const notificationsEnabled = await askNotifications(conversation, ctx, msg);
  if (notificationsEnabled === null) {
    await cancelOnboarding(ctx, msg.chat.id, msg.message_id);
    return;
  }

  let allowsProxy: boolean | null = null;
  if (mode === "authed") {
    allowsProxy = await askProxyPermission(conversation, ctx, msg);
    if (allowsProxy === null) {
      await cancelOnboarding(ctx, msg.chat.id, msg.message_id);
      return;
    }
  }

  const finalUser = await conversation.external(() =>
    db.user.findUnique({ where: { id: user.id }, include: { group: true } }),
  );
  if (!finalUser) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      "Не удалось сохранить настройки. Попробуйте снова через /start",
    );
    return;
  }

  const preferences = getUserPreferences(finalUser);
  preferences.theme = theme;
  if (notificationsEnabled) {
    preferences.notifyBeforeLessons = notificationDefaults.notifyBeforeLessons;
    preferences.notifyAboutNextLesson =
      notificationDefaults.notifyAboutNextLesson;
    preferences.notifyAboutNextDay = notificationDefaults.notifyAboutNextDay;
    preferences.notifyAboutNextWeek = notificationDefaults.notifyAboutNextWeek;
  } else {
    preferences.notifyBeforeLessons = 0;
    preferences.notifyAboutNextLesson = false;
    preferences.notifyAboutNextDay = false;
    preferences.notifyAboutNextWeek = false;
  }

  const now = new Date();
  await conversation.external(async () => {
    await db.user.update({
      where: { id: user.id },
      data: {
        preferences,
        subgroup,
        lastActive: now,
        ics: {
          upsert: {
            create: { validUntil: now },
            update: { validUntil: now },
          },
        },
        allowsAccountProxyUse: allowsProxy ?? false,
      },
    });
    await db.week.updateMany({
      where: { owner: user.id },
      data: { cachedUntil: now },
    });
  });

  await ctx.api.editMessageText(
    msg.chat.id,
    msg.message_id,
    `\
Настройка завершена ✅

Группа: ${finalUser.group?.name ?? "Не выбрана"} (${subgroup || "Обе"})
Тема: ${stylemaps[theme]?.description ?? theme}
Уведомления: ${notificationsEnabled ? "включены" : "отключены"}
${mode === "authed" ? `Анонимный доступ: ${allowsProxy ? "разрешён (Спасибо!)" : "запрещён"}` : ""}

Изменить всё можно через /options
Спасибо, что используете бота!
`,
  );
}

export async function initOnboarding(bot: Bot<Context>) {
  bot.use(createConversation(onboardingConversation, { id: "ONBOARDING" }));
}
