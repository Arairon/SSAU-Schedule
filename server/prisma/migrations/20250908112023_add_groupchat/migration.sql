-- CreateTable
CREATE TABLE "public"."GroupChat" (
    "id" SERIAL NOT NULL,
    "tgId" BIGINT NOT NULL,
    "groupId" INTEGER,
    "userId" INTEGER,
    "updatesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupChat_tgId_key" ON "public"."GroupChat"("tgId");

-- AddForeignKey
ALTER TABLE "public"."GroupChat" ADD CONSTRAINT "GroupChat_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupChat" ADD CONSTRAINT "GroupChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
