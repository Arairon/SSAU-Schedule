import { LessonType } from "@prisma/client";

export type LessonStyleMap = {
  name: string;
  headerStyle: string;
  barColor: string;
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
  general: {
    headerStyle: string;
    emptyWeek: {
      style: string;
      text: string;
    };
  };
  lessonTypes: LessonTypeStyleMap;
};
export type LessonTypeStyleMap = Record<LessonType, LessonStyleMap>;
