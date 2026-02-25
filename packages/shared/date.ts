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

export function getCurrentYearId() {
  const today = new Date();
  let year = today.getFullYear();
  if (today.getMonth() < 7) year -= 1; // if earlier than august - use previous year
  return year - 2011; // Constant. Blame SSAU
}

export function getWeekFromDate(date: Date) {
  const dt = new Date(date);
  dt.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  //
  const week1 = FIRST_STUDY_DAY;
  // if July or earlier use previous year
  // if (dt.getMonth() < 7) week1.setFullYear(week1.getFullYear() - 1); // Handled in FIRST_STUDY_DAY
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

export function isSameDay(date1: Date, date2: Date) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);

  // Set both dates to midnight (start of day)
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);

  return d1.getTime() === d2.getTime();
}
