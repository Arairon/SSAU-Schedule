import { env } from "../env";

export const FIRST_STUDY_DAY = new Date("1970-01-01T00:00:00.000"); // No Z for TZ compliance

function init_first_day() {
  const today = new Date();
  const year =
    today.getMonth() < 7 ? today.getFullYear() - 1 : today.getFullYear();
  FIRST_STUDY_DAY.setFullYear(year);
  FIRST_STUDY_DAY.setMonth(8, 1);
  if (FIRST_STUDY_DAY.getDay() === 7) FIRST_STUDY_DAY.setDate(2);
}
init_first_day();

export function getWeekFromDate(date: Date, startDate?: Date) {
  const dt = new Date(date);
  dt.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  //
  var week1 = FIRST_STUDY_DAY;
  // if July or earlier use previous year
  if (dt.getMonth() < 7) week1.setFullYear(week1.getFullYear() - 1);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  const weekNumber =
    1 +
    Math.round(
      ((dt.getTime() - week1.getTime()) / 86400_000 - // 1 day
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    );
  if (weekNumber > 52) return 52;
  if (weekNumber < 1) return 1;
  return weekNumber;
}

export function getLessonDate(weekNumber: number, weekDay: number) {
  const dayOne = FIRST_STUDY_DAY.getTime();
  const delta =
    86400_000 *
    ((weekNumber - 1) * 7 + weekDay - 1 + FIRST_STUDY_DAY.getDay() - 1);
  const date = new Date(dayOne + delta);
  return date;
}

export function getPersonShortname(fullname: string) {
  const [surname, name, secondname] = fullname.split(" ");
  return `${surname} ${name[0]}.` + (secondname ? secondname[0] + "." : "");
}

export function formatBigInt(x: BigInt | number) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export type ReturnObj<T> =
  | {
      ok: boolean;
      data?: T;
      error?: string;
      message?: string;
    }
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
      message?: string;
    };
