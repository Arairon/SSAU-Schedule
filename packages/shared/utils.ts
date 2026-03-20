import crypto from "crypto";
import z from "zod";

export function getPersonShortname(fullname: string) {
  const [surname, name, secondname] = fullname.split(" ");
  return `${surname} ${name[0]}.` + (secondname ? secondname[0] + "." : "");
}

export function formatBigInt(x: bigint | number) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatSentence(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
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
