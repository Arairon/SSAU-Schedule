const FIRST_STUDY_DAY = new Date("1970-01-01T00:00:00.000"); // No Z for TZ compliance

function getFirstStudyDay(year?: number) {
  const today = new Date();
  let targetYear = year ?? today.getFullYear();
  if (!year) {
    if (today.getMonth() < 7) {
      targetYear -= 1; // if earlier than august - use previous year
    }
  }
  const firstStudyDay = new Date("1970-01-01T00:00:00.000");
  firstStudyDay.setFullYear(targetYear);
  firstStudyDay.setMonth(8, 1);
  if (firstStudyDay.getDay() === 7) firstStudyDay.setDate(2); // If September 1st is Sunday, move to September 2nd (Monday)
  return firstStudyDay
}

function initFirstStudyDay() {
  FIRST_STUDY_DAY.setTime(getFirstStudyDay().getTime());
}

initFirstStudyDay();

export function getCurrentYearId() {
  const today = new Date();
  let year = today.getFullYear();
  if (today.getMonth() < 7) year -= 1; // if earlier than august - use previous year
  return year - 2011; // Constant. Blame SSAU
}

export function getRealYearFromId(yearId: number) {
  return yearId + 2011; // Constant. Blame SSAU
}

export function getWeekFromDate(date: Date, options?: { unclamped?: boolean }) {
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
  if (options?.unclamped) return weekNumber;
  if (weekNumber > 52) return 52;
  if (weekNumber < 1) return 1;
  return weekNumber;
}

// TODO: Year support. Everywhere.
export function getLessonDate(weekNumber: number, weekDay: number) {
  const dayOne = new Date(FIRST_STUDY_DAY);
  const delta =
    86400_000 *
    ((weekNumber - 1) * 7 + weekDay - 1 - (FIRST_STUDY_DAY.getDay() - 1));
  const date = new Date(dayOne.getTime() + delta);
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
