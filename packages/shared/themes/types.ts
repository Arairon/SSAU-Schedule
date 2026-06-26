// import { type LessonType } from "@prisma/client";

export const lessonTypes = [
  "Lection",
  "Lab",
  "Practice",
  "Other",
  "Exam",
  "Consult",
  "Military",
  "CourseWork",
  "Window",
  "Unknown",
] as const;
export type LessonType = (typeof lessonTypes)[number];

export type LessonStyleMap = {
  name: string;
  headerStyle: string;
  barStyle: string;
  cardStyle: string;
  nameStyle: string;
  teacherStyle: string;
  placeStyle: string;
  subgroupStyle: string;
  groupListStyle: string;
  ietStyle: string;
  ietLabel: string;
};

export type StyleMap = {
  name: string;
  description: string;
  general: {
    mainStyle: string;
    headers: {
      main: string;
      timeLabel: string;
      weekday: string;
      timeslot: string;
    };
    emptyWeek: {
      style: string;
      text: string;
    };
  };
  lessonTypes: Record<LessonType, LessonStyleMap>;
};

export type StyleMapConfig = {
  name: string;
  description: string;
  general: {
    mainStyle: string;
    headers: {
      main: string;
      timeLabel: string;
      weekday: string;
      timeslot: string;
    };
    emptyWeek: {
      style: string;
      text: string;
    };
  };
  lessonStyle: Omit<LessonStyleMap, "name">;
  lessonTypes: Record<LessonType, Partial<LessonStyleMap> & { name: string }>;
};

export type LessonTypeStyleMap = Record<LessonType, LessonStyleMap>;
