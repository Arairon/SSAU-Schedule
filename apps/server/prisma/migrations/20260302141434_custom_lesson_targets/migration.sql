-- CreateTable
CREATE TABLE "_CustomLessonTargetUsers" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CustomLessonTargetUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CustomLessonTargetGroups" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CustomLessonTargetGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CustomLessonTargetFlows" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CustomLessonTargetFlows_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CustomLessonTargetUsers_B_index" ON "_CustomLessonTargetUsers"("B");

-- CreateIndex
CREATE INDEX "_CustomLessonTargetGroups_B_index" ON "_CustomLessonTargetGroups"("B");

-- CreateIndex
CREATE INDEX "_CustomLessonTargetFlows_B_index" ON "_CustomLessonTargetFlows"("B");

-- CreateIndex
CREATE INDEX "CustomLesson_userId_weekNumber_idx" ON "CustomLesson"("userId", "weekNumber");

-- AddForeignKey
ALTER TABLE "_CustomLessonTargetUsers" ADD CONSTRAINT "_CustomLessonTargetUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomLessonTargetUsers" ADD CONSTRAINT "_CustomLessonTargetUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomLessonTargetGroups" ADD CONSTRAINT "_CustomLessonTargetGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomLessonTargetGroups" ADD CONSTRAINT "_CustomLessonTargetGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomLessonTargetFlows" ADD CONSTRAINT "_CustomLessonTargetFlows_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomLessonTargetFlows" ADD CONSTRAINT "_CustomLessonTargetFlows_B_fkey" FOREIGN KEY ("B") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
