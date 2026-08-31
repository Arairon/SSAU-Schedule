import crypto from "crypto";
import z from "zod";

export function getPersonShortname(fullname: string) {
  if (!fullname) return "";
  const [surname, name, secondname] = fullname.split(" ");
  if (!name) return surname;
  return `${surname} ${name[0]}.` + (secondname ? secondname[0] + "." : "");
}

export function formatBigInt(x: bigint | number) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatSentence(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function formatName(string: string) {
  return string
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatTimeDelta(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function md5(string: string) {
  const hash = crypto.createHash("md5");
  hash.update(string);
  return hash.digest("hex");
}
export type ReturnObj<T = void> =
  | ([T] extends [void]
    ? { ok: true; message?: string }
    : { ok: true; data: T; message?: string })
  | { ok: false; error: string; message?: string };

export const DayString: { normal: string; in: string }[] = [
  { normal: "воскресенье", in: "в воскресенье" },
  { normal: "понедельник", in: "в понедельник" },
  { normal: "вторник", in: "во вторник" },
  { normal: "среда", in: "в среду" },
  { normal: "четверг", in: "в четверг" },
  { normal: "пятница", in: "в пятницу" },
  { normal: "суббота", in: "в субботу" },
];

export const UserPreferencesSchema = z.object({
  theme: z.string().default("default"),
  showIet: z.boolean().default(true),
  showMilitary: z.boolean().default(true),
  notifyBeforeLessons: z.number().default(0),
  notifyAboutNextLesson: z.boolean().default(false),
  notifyAboutNextDay: z.boolean().default(false),
  notifyAboutNextWeek: z.boolean().default(false),
  trustedLessonCustomizers: z.number().array().default([]),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const UserPreferencesDefaults: UserPreferences = {
  theme: "neon",
  showIet: true,
  showMilitary: false,
  notifyBeforeLessons: 0,
  notifyAboutNextLesson: false,
  notifyAboutNextDay: false,
  notifyAboutNextWeek: false,
  trustedLessonCustomizers: [],
};

export function getUserPreferences(user: {
  preferences: unknown;
}): UserPreferences {
  return Object.assign({}, UserPreferencesDefaults, user.preferences ?? {});
}
export function detectImageMimeType(image: Buffer): "image/png" | "image/jpeg" {
  const isPng =
    image.length >= 8 &&
    image[0] === 0x89 &&
    image[1] === 0x50 &&
    image[2] === 0x4e &&
    image[3] === 0x47 &&
    image[4] === 0x0d &&
    image[5] === 0x0a &&
    image[6] === 0x1a &&
    image[7] === 0x0a;

  if (isPng) {
    return "image/png";
  }

  return "image/jpeg";
}

export function processObjectForLogging(obj: unknown, space = 0): string | null {
  if (obj === null || obj === undefined) return null;
  const seen = new WeakSet();

  return JSON.stringify(
    obj,
    (key, val) => {
      if (val && typeof val === "object") {
        if (seen.has(val)) {
          return "[Circular]";
        }
        seen.add(val);
      }

      if (val instanceof Error) {
        const errorObj = {
          _type: val.constructor.name,
          message: val.message,
          name: val.name,
          stack: val.stack,
          info: {} as Record<string, unknown>,
        };

        Object.getOwnPropertyNames(val).forEach((prop) => {
          if (!(prop in errorObj)) {
            try {
              errorObj.info[prop] = (val as unknown as Record<string, unknown>)[prop];
            } catch {
              // Skip properties that throw on access
            }
          }
        });

        return errorObj;
      }

      if (val instanceof Date) {
        return { _type: "Date", iso: val.toISOString() };
      }

      if (val instanceof RegExp) {
        return { _type: "RegExp", source: val.source, flags: val.flags };
      }

      if (val instanceof Map) {
        return { _type: "Map", entries: Array.from(val.entries()) };
      }

      if (val instanceof Set) {
        return { _type: "Set", values: Array.from(val) };
      }

      if (typeof val === "function") {
        return { _type: "Function", name: val.name || "anonymous" };
      }

      if (val === undefined) {
        return { _type: "undefined" };
      }

      if (typeof val === "bigint") {
        return { _type: "BigInt", value: val.toString() };
      }

      // Handle symbols as keys in objects (rare but possible)
      if (typeof val === "symbol") {
        return val.toString();
      }

      return val;
    },
    space
  );
}


