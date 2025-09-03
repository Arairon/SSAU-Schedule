-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";
-- CreateEnum
CREATE TYPE "public"."LessonType" AS ENUM (
  'Lection',
  'Lab',
  'Practice',
  'Other',
  'Exam',
  'Consult',
  'Military',
  'Window',
  'Unknown'
);
-- CreateTable
CREATE TABLE "public"."Group" (
  "id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "specId" INTEGER NOT NULL DEFAULT 0,
  "specName" TEXT NOT NULL DEFAULT 'Unknown',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."Flow" (
  "id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "disciplineId" INTEGER NOT NULL DEFAULT 0,
  "disciplineName" TEXT NOT NULL DEFAULT 'Unknown',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."Teacher" (
  "id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "shortname" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."Lesson" (
  "id" INTEGER NOT NULL,
  "type" "public"."LessonType" NOT NULL,
  "discipline" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "isOnline" BOOLEAN NOT NULL,
  "building" TEXT,
  "room" TEXT,
  "isIet" BOOLEAN NOT NULL DEFAULT false,
  "subgroup" INTEGER,
  "teacherId" INTEGER NOT NULL,
  "dayTimeSlot" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "beginTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "weekday" INTEGER NOT NULL,
  "conferenceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."User" (
  "id" SERIAL NOT NULL,
  "tgId" BIGINT NOT NULL,
  "staffId" INTEGER,
  "fullname" TEXT,
  "groupId" INTEGER,
  "authCookie" TEXT,
  "authCookieExpiresAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
  "sessionExpiresAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
  "username" TEXT,
  "password" TEXT,
  "preferences" JSONB NOT NULL DEFAULT '{}',
  "subgroup" INTEGER,
  "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."UserIcs" (
  "id" INTEGER NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
  "data" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserIcs_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."GroupIcs" (
  "id" INTEGER NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
  "data" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupIcs_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."Week" (
  "id" SERIAL NOT NULL,
  "owner" INTEGER NOT NULL DEFAULT 0,
  "groupId" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "number" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
  "timetable" JSONB,
  "cachedUntil" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "db_updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."WeekImage" (
  "id" SERIAL NOT NULL,
  "weekId" INTEGER NOT NULL,
  "stylemap" TEXT NOT NULL DEFAULT 'default',
  "tgId" TEXT,
  "data" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeekImage_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."ScheduledMessage" (
  "id" SERIAL NOT NULL,
  "chatId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "image" TEXT,
  "entities" JSONB NOT NULL DEFAULT '[]',
  "sendAt" TIMESTAMP(3) NOT NULL,
  "wasSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."_GroupToLesson" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL,
  CONSTRAINT "_GroupToLesson_AB_pkey" PRIMARY KEY ("A", "B")
);
-- CreateTable
CREATE TABLE "public"."_FlowToLesson" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL,
  CONSTRAINT "_FlowToLesson_AB_pkey" PRIMARY KEY ("A", "B")
);
-- CreateTable
CREATE TABLE "public"."_FlowToUser" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL,
  CONSTRAINT "_FlowToUser_AB_pkey" PRIMARY KEY ("A", "B")
);
-- CreateTable
CREATE TABLE "public"."_LessonToWeek" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL,
  CONSTRAINT "_LessonToWeek_AB_pkey" PRIMARY KEY ("A", "B")
);
-- CreateIndex
CREATE UNIQUE INDEX "User_tgId_key" ON "public"."User"("tgId");
-- CreateIndex
CREATE INDEX "Week_owner_groupId_year_number_idx" ON "public"."Week"("owner", "groupId", "year", "number");
-- CreateIndex
CREATE INDEX "Week_owner_year_number_idx" ON "public"."Week"("owner", "year", "number");
-- CreateIndex
CREATE UNIQUE INDEX "Week_owner_groupId_year_number_key" ON "public"."Week"("owner", "groupId", "year", "number");
-- CreateIndex
CREATE INDEX "ScheduledMessage_sendAt_wasSentAt_idx" ON "public"."ScheduledMessage"("sendAt", "wasSentAt");
-- CreateIndex
CREATE INDEX "_GroupToLesson_B_index" ON "public"."_GroupToLesson"("B");
-- CreateIndex
CREATE INDEX "_FlowToLesson_B_index" ON "public"."_FlowToLesson"("B");
-- CreateIndex
CREATE INDEX "_FlowToUser_B_index" ON "public"."_FlowToUser"("B");
-- CreateIndex
CREATE INDEX "_LessonToWeek_B_index" ON "public"."_LessonToWeek"("B");
-- AddForeignKey
ALTER TABLE "public"."Lesson"
ADD CONSTRAINT "Lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."User"
ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE
SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."UserIcs"
ADD CONSTRAINT "UserIcs_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."GroupIcs"
ADD CONSTRAINT "GroupIcs_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."Week"
ADD CONSTRAINT "Week_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."WeekImage"
ADD CONSTRAINT "WeekImage_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "public"."Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."_GroupToLesson"
ADD CONSTRAINT "_GroupToLesson_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."_GroupToLesson"
ADD CONSTRAINT "_GroupToLesson_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."_FlowToLesson"
ADD CONSTRAINT "_FlowToLesson_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."_FlowToLesson"
ADD CONSTRAINT "_FlowToLesson_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."_FlowToUser"
ADD CONSTRAINT "_FlowToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."_FlowToUser"
ADD CONSTRAINT "_FlowToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."_LessonToWeek"
ADD CONSTRAINT "_LessonToWeek_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "public"."_LessonToWeek"
ADD CONSTRAINT "_LessonToWeek_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;