import type { User } from "@/generated/prisma/client";
import type { MessageEntity } from "grammy/types";
import { db } from "@/db";
import { type TeacherType } from "@/ssau/schemas/schedule";
import { getPersonShortname } from "@ssau-schedule/shared/utils";

export async function ensureGroupExists(group: {
  id: number;
  name: string;
  specId?: number;
  specName?: string;
  spec?: { id: number; name: string };
}) {
  const data = {
    id: group.id,
    name: group.name,
    specId: group.specId ?? group.spec?.id ?? undefined,
    specName: group.specName ?? group.spec?.name ?? undefined,
  };
  await db.group.upsert({
    where: { id: group.id },
    update: data,
    create: data,
  });
}

export async function ensureFlowExists(flow: {
  id: number;
  name: string;
  disciplineId?: number;
  disciplineName?: string;
  discipline?: { id: number; name: string };
}) {
  const data = {
    id: flow.id,
    name: flow.name,
    disciplineId: flow.disciplineId ?? flow.discipline?.id ?? undefined,
    disciplineName: flow.disciplineName ?? flow.discipline?.name ?? undefined,
  };
  await db.flow.upsert({
    where: { id: flow.id },
    update: data,
    create: data,
  });
}

export async function ensureTeacherExists(teacher: TeacherType) {
  const data = {
    id: teacher.id,
    name: teacher.name,
    shortname: getPersonShortname(teacher.name),
    state: teacher.state,
  };
  await db.teacher.upsert({
    where: { id: teacher.id },
    update: data,
    create: data,
  });
}

export async function scheduleMessage(
  user: User,
  sendAt: Date,
  text: string,
  opts?: { entities?: MessageEntity[]; image?: string; source?: string },
) {
  await db.scheduledMessage.create({
    data: {
      chatId: `${user.tgId}`,
      text,
      sendAt,
      entities: opts?.entities as object[],
      image: opts?.image,
      source: opts?.source,
    },
  });
}

export type RequestStateUpdate<T extends string> = {
  state: T;
  message?: string;
};
