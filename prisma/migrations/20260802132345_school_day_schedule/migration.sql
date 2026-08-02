/*
  Warnings:

  - You are about to drop the column `standardEndTime` on the `School` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `School` table. All the data in the column will be lost.
  - You are about to drop the column `wednesdayEndTime` on the `School` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY');

-- AlterTable
ALTER TABLE "School" DROP COLUMN "standardEndTime",
DROP COLUMN "startTime",
DROP COLUMN "wednesdayEndTime";

-- CreateTable
CREATE TABLE "SchoolDaySchedule" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dayOfWeek" "Weekday" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakStart" TEXT,
    "breakEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDaySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolDaySchedule_schoolId_dayOfWeek_key" ON "SchoolDaySchedule"("schoolId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "SchoolDaySchedule" ADD CONSTRAINT "SchoolDaySchedule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
