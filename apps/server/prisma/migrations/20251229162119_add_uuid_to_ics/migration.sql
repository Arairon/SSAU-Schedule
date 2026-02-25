/*
  Warnings:

  - A unique constraint covering the columns `[uuid]` on the table `UserIcs` will be added. If there are existing duplicate values, this will fail.
  - The required column `uuid` was added to the `UserIcs` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/

-- CUSTOM: Clear the table
TRUNCATE TABLE "public"."UserIcs" CASCADE;

-- AlterTable
ALTER TABLE "public"."UserIcs" ADD COLUMN     "uuid" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserIcs_uuid_key" ON "public"."UserIcs"("uuid");
