export function getWeekFromDate(date: Date) {
  const dt = new Date(date);
  dt.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  // January 4 is always in week 1. But we use september for study weeks
  var week1 = new Date(dt.getFullYear(), 8, 4);
  // if July or earlier use previous year
  if (dt.getMonth() < 7) week1.setFullYear(week1.getFullYear() - 1);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  const weekNumber =
    1 +
    Math.round(
      ((dt.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    );
  if (weekNumber > 52) return 52;
  if (weekNumber < 1) return 1;
  return weekNumber;
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
