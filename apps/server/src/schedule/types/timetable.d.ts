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

export type TimetableDay = {
  // user: number;
  week: number;
  weekday: number;
  beginTime: Date;
  endTime: Date;
  lessons: TimetableLesson[];
  lessonCount: number;
};

export type Timetable = {
  weekId: number;
  // user: number; // To allow sharing hashes
  groupId: number;
  year: number;
  week: number;
  // hash: string; // TODO: generate from lessons
  //withIet: boolean;
  //isCommon: boolean;
  days: TimetableDay[];
};
