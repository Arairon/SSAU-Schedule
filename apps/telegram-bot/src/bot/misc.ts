import { api } from "@/serverClient";
import type { Context } from "./types";
import log from "@/logger";
import type { RedactedUserWithGroup } from "@ssau-schedule/server/src/api/internal/user";

/**
 * `false` -> failed
 * `null` -> succeeded and returned no user
 * `User` -> succeeded and returned a user
 */
export async function getUser(
  ctx: Context,
  opts: { required?: boolean; silent?: boolean } = {},
): Promise<false | null | RedactedUserWithGroup> {
  const userId = ctx.from?.id;
  if (!userId) return false;

  try {
    const res = await api.user.tgid({ id: userId }).get();
    if (res.status === 200) {
      return res.data!;
    } else if (res.status === 404) {
      if (opts.required) {
        if (!opts.silent)
          await ctx.reply(
            `Вас не существует в базе данных, пожалуйста пропишите /start`,
          );
      }
      return null;
    } else {
      log.error(`Error while fetching user`, {
        tag: "get",
        user: userId,
      });
      if (!opts.silent)
        await ctx.reply(
          `Не удалось связаться с сервером, попробуйте позже или свяжитесь с администратором бота`,
        );
      return false;
    }
  } catch (e) {
    log.error(`Error while fetching user: ${JSON.stringify(e)}`, {
      tag: "get",
      user: userId,
    });
    if (!opts.silent)
      await ctx.reply(
        `Не удалось связаться с сервером, попробуйте позже или свяжитесь с администратором бота`,
      );
    return false;
  }
}
