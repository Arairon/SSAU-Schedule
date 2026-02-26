import { db } from "@/db";
import { ensureGroupExists, ensureTeacherExists } from "@/lib/misc";
import log from "@/logger";
import s from "ajv-ts";
import axios from "axios";

type GroupTeacherSearchResponse = {
  id: number;
  name: string;
  type: "group" | "teacher";
};

const ssauSearchResponseSchema = s.object({
  id: s.number(),
  url: s.string(),
  text: s.string(),
});

export async function findGroupsOrTeachersInSsau(
  text: string,
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
    const csrfRegex = /name="csrf-token".{0,3}content="(\w+)".{0,3}\/>/m;
    const execResult = csrfRegex.exec((page.data as string).slice(0, 200));
    const token = execResult ? execResult[1] : undefined;
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
      },
    );
    const { success, data, error } = s
      .array(ssauSearchResponseSchema)
      .safeParse(resp.data);
    if (!success) {
      log.warn(
        `Failed to parse search response for '${text}' in ssau.ru/rasp, ${error}`,
        { user: -1 },
      );
      return [];
    }

    const options: GroupTeacherSearchResponse[] = data.map((option) => ({
      id: option.id,
      name: option.text.trim(),
      type: option.url.includes("groupId") ? "group" : "teacher",
    }));

    for (const option of options) {
      if (option.type === "group") {
        await ensureGroupExists({
          id: option.id,
          name: option.name,
        });
      } else if (option.type === "teacher") {
        await ensureTeacherExists({
          id: option.id,
          name: option.name,
          state: "unknown",
        });
        log.warn(
          `Found teacher '${option.name}' in search, but teachers are not supported yet.`,
          {
            user: -1,
          },
        );
      }
    }

    return options.filter((option) => option.type === "group"); // TODO: support teachers
  } catch {
    log.warn(`Search for '${text}' in ssau.ru/rasp failed.`);
    return [];
  }
}

export async function findGroup(
  inp: { groupName?: string; groupId?: number } & (
    | { groupName: string }
    | { groupId: number }
  ),
) {
  const group = await findGroupOrOptions(inp);
  if (Array.isArray(group)) {
    if (group.length === 1) return group[0];
  } else {
    return group;
  }
  return null;
}

export async function findGroupOrOptions(
  inp: { groupName?: string; groupId?: number } & (
    | { groupName: string }
    | { groupId: number }
  ),
) {
  if (inp.groupId) {
    const group = await db.group.findUnique({ where: { id: inp.groupId } });
    if (group) return group;
  }
  if (inp.groupName) {
    const name = inp.groupName.trim();
    if (name.length >= 11) {
      // 6101-090301 (D optional)
      const existingGroup = await db.group.findFirst({
        where: { name: { startsWith: name } },
      });
      if (existingGroup) return existingGroup;
    } else {
      const existingGroup = await db.group.findFirst({
        where: { name: name },
      });
      if (existingGroup) return existingGroup;
    }
    const possibleGroups = await findGroupsOrTeachersInSsau(name);
    return possibleGroups;
  }
  return null;
}
