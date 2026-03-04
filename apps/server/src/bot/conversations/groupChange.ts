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

const GROUP_CHANGE_CANCEL = "group_change_cancel";
const GROUP_CHANGE_FROM_LK = "group_change_from_lk";
const GROUP_CHANGE_SELECT_PREFIX = "group_change_select_";

function getMainKeyboard(hasLkAccess: boolean) {
  const keyboard = new InlineKeyboard();
  if (hasLkAccess) {
    keyboard.text("Получить группу из ЛК", GROUP_CHANGE_FROM_LK).row();
  }
  keyboard.text("Отмена", GROUP_CHANGE_CANCEL);
  return keyboard;
}

function getGroupsKeyboard(groups: { id: number; name: string }[]) {
  const keyboard = new InlineKeyboard();
  groups.slice(0, 9).forEach((group, index) => {
    keyboard.text(group.name, `${GROUP_CHANGE_SELECT_PREFIX}${group.id}`);
    if ((index + 1) % 3 === 0) keyboard.row();
  });
  if (groups.length % 3 !== 0) keyboard.row();
  keyboard.text("Отмена", GROUP_CHANGE_CANCEL);
  return keyboard;
}

async function changeUserGroupById(userId: number, groupId: number) {
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
  log.info(`User group updated to ${user.group?.name} #${groupId}`, {
    user: userId,
  });
  return user;
}

type GroupChangeResult =
  | { ok: false; message: string }
  | { ok: true; updatedUser: Awaited<ReturnType<typeof changeUserGroupById>> };

async function groupChangeConversation(
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
    db.user.findUnique({ where: { tgId: tgUserId } }),
  );
  if (!user) {
    return ctx.reply(
      "Вас не существует в базе данных. Пожалуйста пропишите /start",
    );
  }

  const hasLkAccess = Boolean(user.authCookie);
  let selectableGroups: { id: number; name: string }[] = [];

  const msg = await ctx.reply(
    `Смена группы\n\nВведите полное или частичное название группы (например: 6101-090301D).\nДля отмены в любой момент используйте /cancel.`,
    {
      reply_markup: getMainKeyboard(hasLkAccess),
    },
  );

  while (true) {
    const update = await conversation.wait();

    const callbackData =
      update.callbackQuery && "data" in update.callbackQuery
        ? update.callbackQuery.data
        : null;
    const messageText =
      update.message && "text" in update.message
        ? update.message.text?.trim()
        : undefined;

    if (callbackData === GROUP_CHANGE_CANCEL || messageText === "/cancel") {
      log.debug("Group change cancelled", { user: tgUserId });
      if (callbackData) {
        await update.answerCallbackQuery().catch();
      }
      return ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        "Смена группы отменена\nВернуться в меню: /options",
      );
    }

    if (callbackData === GROUP_CHANGE_FROM_LK) {
      await update.answerCallbackQuery().catch();

      if (!hasLkAccess) {
        log.warn("Group change from LK requested by non-auth user", {
          user: tgUserId,
        });
        await ctx.api.editMessageText(
          msg.chat.id,
          msg.message_id,
          "Для получения группы из ЛК сначала выполните вход через /login",
          { reply_markup: getMainKeyboard(hasLkAccess) },
        );
        continue;
      }

      await ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        "Получаем группу из личного кабинета...",
        { reply_markup: getMainKeyboard(hasLkAccess) },
      );

      const lkResult: GroupChangeResult = await conversation.external(
        async (): Promise<GroupChangeResult> => {
          const actualUser = await db.user.findUnique({
            where: { id: user.id },
          });
          if (!actualUser) {
            return {
              ok: false,
              message:
                "Вас не существует в базе данных. Пожалуйста пропишите /start",
            };
          }

          const res = await lk.updateUserInfo(actualUser, {
            overrideGroup: true,
          });
          const groupId = res.data?.groupId;
          if (!res.ok) {
            return {
              ok: false,
              message:
                "Не удалось получить группу из ЛК. Попробуйте повторно войти через /login или выбрать группу вручную.",
            };
          }
          if (!groupId) {
            return {
              ok: false,
              message:
                "В ЛК не удалось определить группу. Попробуйте указать группу вручную.",
            };
          }

          const updatedUser = await changeUserGroupById(user.id, groupId);
          return { ok: true, updatedUser };
        },
      );

      if (!lkResult.ok) {
        log.warn(`Failed to change group from LK: ${lkResult.message}`, {
          user: tgUserId,
        });
        await ctx.api.editMessageText(
          msg.chat.id,
          msg.message_id,
          lkResult.message,
          { reply_markup: getMainKeyboard(hasLkAccess) },
        );
        continue;
      }

      return ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `Группа успешно изменена на '${lkResult.updatedUser.group?.name ?? "Неизвестно"}'\nВернуться в меню: /options`,
      );
    }

    if (callbackData?.startsWith(GROUP_CHANGE_SELECT_PREFIX)) {
      await update.answerCallbackQuery().catch();

      const rawGroupId = callbackData.slice(GROUP_CHANGE_SELECT_PREFIX.length);
      const groupId = Number(rawGroupId);
      const selectedGroup = selectableGroups.find(
        (group) => group.id === groupId,
      );
      if (!selectedGroup || Number.isNaN(groupId) || groupId <= 0) {
        log.warn("Invalid group selection in group change", {
          user: tgUserId,
        });
        await ctx.api.editMessageText(
          msg.chat.id,
          msg.message_id,
          "Не удалось определить группу. Попробуйте найти группу заново.",
          { reply_markup: getMainKeyboard(hasLkAccess) },
        );
        continue;
      }

      log.debug("Group selected from options in group change", {
        user: tgUserId,
      });
      const updatedUser = await conversation.external(() =>
        changeUserGroupById(user.id, selectedGroup.id),
      );
      return ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `Группа успешно изменена на '${updatedUser.group?.name ?? selectedGroup.name}'`,
      );
    }

    if (!messageText) {
      continue;
    }

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
      `Ищем группу по запросу '${messageText}'...`,
      { reply_markup: getMainKeyboard(hasLkAccess) },
    );

    const groups = await conversation.external(() =>
      findGroupOrOptions({ groupName: messageText }),
    );

    if (!groups || (Array.isArray(groups) && groups.length === 0)) {
      selectableGroups = [];
      await ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        "Группа или похожие на неё группы не найдены. Попробуйте другой запрос.",
        { reply_markup: getMainKeyboard(hasLkAccess) },
      );
      continue;
    }

    if (!Array.isArray(groups)) {
      const updatedUser = await conversation.external(() =>
        changeUserGroupById(user.id, groups.id),
      );
      return ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `Группа успешно изменена на '${updatedUser.group?.name ?? groups.name}'`,
      );
    }

    if (groups.length === 1) {
      const updatedUser = await conversation.external(() =>
        changeUserGroupById(user.id, groups[0].id),
      );
      return ctx.api.editMessageText(
        msg.chat.id,
        msg.message_id,
        `Группа успешно изменена на '${updatedUser.group?.name ?? groups[0].name}'`,
      );
    }

    selectableGroups = groups.slice(0, 9).map((group) => ({
      id: group.id,
      name: group.name,
    }));

    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      "Найдено несколько групп. Выберите нужную кнопкой ниже или введите более точное название.",
      { reply_markup: getGroupsKeyboard(selectableGroups) },
    );
  }
}

export async function initGroupChange(bot: Bot<Context>) {
  bot.use(createConversation(groupChangeConversation, { id: "GROUP_CHANGE" }));
}
