export type LessonType =
  | "Lection"
  | "Lab"
  | "Practice"
  | "Other"
  | "Exam"
  | "Consult"
  | "Military"
  | "Window"
  | "CourseWork"
  | "Unknown";

export interface DrawableLesson {
  dayTimeSlot: number;
  beginTime: Date;
  endTime: Date;
  type: LessonType;
  discipline: string;
  teacher: {
    name: string;
  };
  isOnline: boolean;
  building: string | null;
  room: string | null;
  isIet: boolean;
  subgroup: number | null;
  groups: string[];
  flows: string[];
  alts: DrawableLesson[];
  customized: LessonCustomizationInfo | null;
  original: {
    id: number;
  } | null
}

export interface DrawableDay {
  week: number;
  weekday: number;
  beginTime: Date;
  endTime: Date;
  lessons: DrawableLesson[];
}
export interface DrawableTimetable {
  week: number;
  year: number;
  days: DrawableDay[];
}

interface LessonCustomizationInfo {
  hidden: boolean;
  disabled: boolean;
  comment: string;
  customizedBy: number;
}

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
  customized: LessonCustomizationInfo | null;
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

export type TeacherTimetable = {
  teacherId: number;
  teacherName?: string;
  year: number;
  week: number;
  hash: string;
  days: TimetableDay[]; // Should always have length of 6
};

export type TimetableWithDiff = Timetable & { diff?: TimetableDiff };

type WeekImage = {
  id: number;
  tgId: string | null;
  data: string;
  timetableHash: string;
  stylemap: string;
};

export type TimetableWithImage = {
  timetable: TimetableWithDiff;
  image: WeekImage;
};

export type TeacherTimetableWithImage = {
  timetable: TeacherTimetable & { diff?: TimetableDiff };
  image: WeekImage;
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
  modified: { old: Partial<TimetableLesson>; new: TimetableLesson }[]; // Same name, type and time
};
