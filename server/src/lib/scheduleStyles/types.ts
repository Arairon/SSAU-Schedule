import { LessonType } from "@prisma/client";

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
  lessonTypes: LessonTypeStyleMap;
};
export type LessonTypeStyleMap = Record<LessonType, LessonStyleMap>;
