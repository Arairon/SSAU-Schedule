import axios from "axios";
import { db } from "../db";
import { UserGroupType } from "./lkSchemas";
import { TeacherType } from "./scheduleSchemas";
import { getPersonShortname } from "./utils";
import log from "../logger";

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

type GroupTeacherSearchResponse = {
  id: number;
  url: string;
  text: string;
};
export async function findGroupOrTeacherInSsau(
  text: string
): Promise<GroupTeacherSearchResponse[]> {
  log.debug(`Trying to find '${text}' in ssau.ru/rasp`);
  try {
    const page = await axios.get("https://ssau.ru/rasp", {
      withCredentials: true,
      responseType: "text",
    });
    const cookies: string[] = [];
    page.headers["set-cookie"]?.forEach((cookie) => {
      cookies.push(cookie.split(";")[0]);
    });
    const token = (page.data as string)
      .slice(0, 200)
      .match(/name="csrf-token".{0,3}content="(\w+)".{0,3}\/>/m)
      ?.at(1);
    const resp = await axios.post(
      "https://ssau.ru/rasp/search",
      `text=${encodeURI(text)}`,
      {
        headers: {
          "X-CSRF-TOKEN": token,
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookies.join(";"),
        },
        withCredentials: true,
      }
    );
    return resp.data;
  } catch {
    log.warn(`Search for '${text}' in ssau.ru/rasp failed.`);
    return [];
  }
}

export async function findGroup(
  inp: { groupName?: string; groupId?: number } & (
    | { groupName: string }
    | { groupId: number }
  )
) {
  if (inp.groupId) {
    const group = await db.group.findUnique({ where: { id: inp.groupId } });
    if (group) return group;
  }
  if (inp.groupName) {
    const existingGroup = await db.group.findFirst({
      where: { name: { startsWith: inp.groupName } },
    });
    if (existingGroup) return existingGroup;
    const possibleGroups = await findGroupOrTeacherInSsau(inp.groupName);
    if (possibleGroups.length === 1) return possibleGroups[0];
  }
  return null;
}
