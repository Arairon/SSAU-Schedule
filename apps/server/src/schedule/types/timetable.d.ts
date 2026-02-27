import type { LessonType } from "@/generated/prisma/enums";

export type TimetableLesson = {
  id: number;
  infoId: number;
  type: LessonType;
  discipline: string;
  teacher: {
    name: string;
    id: number | null;
  };
  isOnline: boolean;
  building: string | null;
  room: string | null;
  isIet: boolean;
  subgroup: number | null;
  groups: string[];
  flows: string[];
  dayTimeSlot: number;
  beginTime: Date;
  endTime: Date;
  conferenceUrl: string | null;
  original: TimetableLesson | null;
  customized: {
    hidden: boolean;
    disabled: boolean;
    comment: string;
    customizedBy: number;
  } | null;
  alts: TimetableLesson[];
};

type NormalizedTimetableLesson = {
  id: number;
  infoId: number;
  type: LessonType;
  discipline: string;
  teacher: {
    name: string;
    id: number | null;
  };
  isOnline: boolean;
  isIet: boolean;
  building: string | null;
  room: string | null;
  subgroup: number | null;
  groups: string[];
  flows: string[];
  dayTimeSlot: number;
  beginTime: number;
  endTime: number;
  conferenceUrl: string | null;
  customized: {
    hidden: boolean;
    disabled: boolean;
    comment: string;
    customizedBy: number;
  } | null;
};

export type TimetableDay = {
  // user: number;
  week: number;
  weekday: number;
  beginTime: Date;
  endTime: Date;
  lessons: TimetableLesson[]; // Has variable length
  lessonCount: number;
};

export type Timetable = {
  weekId: number;
  // user: number; // To allow sharing hashes
  groupId: number;
  year: number;
  week: number;
  hash: string;
  //withIet: boolean;
  //isCommon: boolean;
  days: TimetableDay[]; // Should always have length of 6
};

export type TimetableDayWithWindows = {
  // user: number;
  week: number;
  weekday: number;
  beginTime: Date;
  endTime: Date;
  lessons: (TimetableLesson | null)[]; // Should always have length of 8, some slots can be null if there are no lessons
  lessonCount: number;
};

export type TimetableWithWindows = {
  weekId: number;
  // user: number; // To allow sharing hashes
  groupId: number;
  year: number;
  week: number;
  hash: string;
  //withIet: boolean;
  //isCommon: boolean;
  days: TimetableDayWithWindows[]; // Should always have length of 6
};

export type TimetableDiff = {
  added: TimetableLesson[];
  removed: TimetableLesson[];
};
