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

const ssauSearchCache = new Map<string, GroupTeacherSearchResponse[]>();
const inFlightSsauSearches = new Map<
  string,
  Promise<GroupTeacherSearchResponse[]>
>();

function normalizeSsauSearchText(text: string) {
  return text.trim().toLowerCase();
}

function cloneSearchResults(
  results: GroupTeacherSearchResponse[],
): GroupTeacherSearchResponse[] {
  return results.map((result) => ({ ...result }));
}

async function fetchGroupsOrTeachersInSsau(
  text: string,
): Promise<GroupTeacherSearchResponse[] | null> {
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
    const csrfRegex = /name="csrf-token".{0,3}content="(\w+)".{0,3}\/\>/m;
    const execResult = csrfRegex.exec((page.data as string).slice(0, 200));
    const token = execResult ? execResult[1] : undefined;
    const resp = await axios.post(
      "https://ssau.ru/rasp/search",
      `text=${encodeURIComponent(text)}`,
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
      return null;
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
    return null;
  }
}

export async function findGroupsOrTeachersInSsau(
  text: string,
): Promise<GroupTeacherSearchResponse[]> {
  const normalizedText = normalizeSsauSearchText(text);
  const cachedResults = ssauSearchCache.get(normalizedText);
  if (cachedResults) {
    log.debug(
      `Cache hit for '${text}' in ssau.ru/rasp search -> ${cachedResults.length} results`,
    );
    return cloneSearchResults(cachedResults);
  }

  // Deduplicate concurrent searches for the same query.
  const inFlight = inFlightSsauSearches.get(normalizedText);
  if (inFlight) {
    log.debug(`Waiting for in-flight search for '${text}' in ssau.ru/rasp`);
    return cloneSearchResults(await inFlight);
  }

  const request = (async () => {
    const results = await fetchGroupsOrTeachersInSsau(normalizedText);
    if (results) {
      ssauSearchCache.set(normalizedText, results);
      return results;
    }
    return [];
  })();

  inFlightSsauSearches.set(normalizedText, request);
  try {
    return cloneSearchResults(await request);
  } finally {
    inFlightSsauSearches.delete(normalizedText);
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
): Promise<Omit<GroupTeacherSearchResponse, "type">[]> {
  if (inp.groupId) {
    const group = await db.group.findUnique({ where: { id: inp.groupId } });
    if (group) return [group];
  }
  if (inp.groupName) {
    const name = inp.groupName.trim();
    if (name.length >= 11) {
      // 6101-090301 (D optional)
      const existingGroup = await db.group.findFirst({
        where: { name: { startsWith: name } },
      });
      if (existingGroup) return [existingGroup];
    } else {
      const existingGroup = await db.group.findFirst({
        where: { name: name },
      });
      if (existingGroup) return [existingGroup];
    }
    const possibleGroups = await findGroupsOrTeachersInSsau(name);
    return possibleGroups;
  }
  return [];
}
