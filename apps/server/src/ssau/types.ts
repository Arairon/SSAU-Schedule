import { LessonType } from "@/generated/prisma/enums";
import log from "@/logger";

const LessonTypeMap = [
  LessonType.Unknown,
  LessonType.Lection,
  LessonType.Lab,
  LessonType.Practice,
  LessonType.Other,
  LessonType.Exam,
  LessonType.Consult,
];
export function getLessonTypeEnum(type: number) {
  if (type < 0 || type >= LessonTypeMap.length) {
    log.error(`Found an unexpected typeId: ${type}`);
    type = 0;
  }
  return LessonTypeMap[type] as LessonType;
}
