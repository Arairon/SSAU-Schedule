import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import log from "@/logger";
import { env } from "@/env";

const defaults = {
  ssauNextAction: "60ec26be5c78628290529c6be2e0e64c114c5502af",
} as const;

const stateSchema = z.object({
  ssauNextAction: z
    .string()
    .trim()
    .min(1)
    .default(env.SCHED_SSAU_NEXT_ACTION ?? defaults.ssauNextAction),
});

const defaultState = stateSchema.parse({});

type RuntimeState = z.infer<typeof stateSchema>;

const STATE_FILE_PATH = path.resolve(process.cwd(), "state.json");

let runtimeStateInitialized = false;
export const runtimeState: RuntimeState = defaultState;

async function readStateFromDisk(): Promise<RuntimeState> {
  try {
    const raw = await readFile(STATE_FILE_PATH, "utf8");
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      log.warn(
        `Invalid runtime state file at ${STATE_FILE_PATH}; using empty state`,
        {
          tag: "read",
          user: "state",
        },
      );
      return defaultState;
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return defaultState;
    }
    log.warn(
      `Failed to read runtime state at ${STATE_FILE_PATH}; using empty state`,
      {
        tag: "read",
        user: "state",
        object: error as object,
      },
    );
    return defaultState;
  }
}

export async function ensureStateLoaded() {
  if (!runtimeStateInitialized) {
    const upd = await readStateFromDisk();
    Object.assign(runtimeState, upd);
    runtimeStateInitialized = true;
  }
  return runtimeState;
}

export async function writeStateToDisk(state?: RuntimeState) {
  const obj = state ?? runtimeState;
  if (!obj) {
    throw new Error("No runtime state to write");
  }
  const dirPath = path.dirname(STATE_FILE_PATH);
  await mkdir(dirPath, { recursive: true });

  const tempPath = `${STATE_FILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  const json = JSON.stringify(obj, null, 2) + "\n";

  await writeFile(tempPath, json, "utf8");
  await rename(tempPath, STATE_FILE_PATH);
}

export async function reloadRuntimeState() {
  Object.assign(runtimeState, await readStateFromDisk());
  return runtimeState;
}

void ensureStateLoaded().then(() => {
  log.info("Runtime state loaded", {
    tag: "init",
    user: "state",
    object: runtimeState,
    objectPretty: true,
  });
});
