import { User } from "@prisma/client";
import axios from "axios";
import { getWeekFromDate } from "./utils";
import { db } from "../db";
import { lk } from "./lk";
import log from "../logger";

async function updateWeekForUser(week: number, user: User) {
  const weekNumber = week || getWeekFromDate(new Date());
  await lk.ensureAuth(user);
  log.debug(`Updating week ${weekNumber}`, { user: user.id });
  //await axios.get(``);
}

async function updateWeekRangeForUser(
  opts: {
    weeks: number[];
    user?: User;
    userId?: number;
  } & ({ user: User } | { userId: number }),
) {
  const user =
    opts.user ?? (await db.user.findUnique({ where: { id: opts.userId } }));
  if (!user) throw new Error("User not found");
  if (!user.groupId) await lk.updateUserInfo(user);
  for (const week of opts.weeks) {
    await updateWeekForUser(week, user);
  }
}

export const schedule = {
  updateWeekForUser,
  updateWeekRangeForUser,
};
