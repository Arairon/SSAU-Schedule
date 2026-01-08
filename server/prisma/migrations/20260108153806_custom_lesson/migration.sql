-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "customLessonId" INTEGER;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "customLessonId" INTEGER;

-- CreateTable
CREATE TABLE "CustomLesson" (
    "id" SERIAL NOT NULL,
    "lessonId" INTEGER,
    "lessonInfoId" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hideLesson" BOOLEAN NOT NULL DEFAULT false,
    "type" "LessonType",
    "discipline" TEXT,
    "building" TEXT,
    "room" TEXT,
    "conferenceUrl" TEXT,
    "subgroup" INTEGER,
    "teacherId" INTEGER,
    "isOnline" BOOLEAN,
    "isIet" BOOLEAN,
    "dayTimeSlot" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "beginTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CustomLessonToWeek" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CustomLessonToWeek_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "CustomLesson_lessonId_userId_idx" ON "CustomLesson"("lessonId", "userId");

-- CreateIndex
CREATE INDEX "CustomLesson_userId_idx" ON "CustomLesson"("userId");

-- CreateIndex
CREATE INDEX "_CustomLessonToWeek_B_index" ON "_CustomLessonToWeek"("B");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_customLessonId_fkey" FOREIGN KEY ("customLessonId") REFERENCES "CustomLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_customLessonId_fkey" FOREIGN KEY ("customLessonId") REFERENCES "CustomLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomLesson" ADD CONSTRAINT "CustomLesson_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomLesson" ADD CONSTRAINT "CustomLesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomLesson" ADD CONSTRAINT "CustomLesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomLessonToWeek" ADD CONSTRAINT "_CustomLessonToWeek_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomLessonToWeek" ADD CONSTRAINT "_CustomLessonToWeek_B_fkey" FOREIGN KEY ("B") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;
