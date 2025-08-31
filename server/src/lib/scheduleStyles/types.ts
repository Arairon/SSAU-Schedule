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
};

export type StyleMap = {
  header: {
    headerStyle: string;
  };
  lessonTypes: LessonTypeStyleMap;
};
export type LessonTypeStyleMap = Record<LessonType, LessonStyleMap>;
