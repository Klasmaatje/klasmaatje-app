/*
  Klasmaatje - ruggengraat stap 1: rollen + groepen (ClassGroup)

  Warnings:

  - You are about to drop the column `groep` on the `WeekPlan` table. All the data in the column will be lost.
  - Added the required column `classGroupId` to the `WeekPlan` table without a default value. This is not possible if the table is not empty.
    -> Controleer vooraf: SELECT count(*) FROM "WeekPlan";  (moet 0 zijn)

  Handmatige toevoegingen onderaan (Prisma kent deze niet, ze blijven gewoon in de DB):
  - CHECK-constraints op leerjaren (1-8)
  - RLS aan op de twee nieuwe tabellen (zelfde als je eerder handmatig deed; nu reproduceerbaar via migrate deploy)
*/

-- CreateEnum
CREATE TYPE "ClassGroupRole" AS ENUM ('GROUP_TEACHER', 'SUBSTITUTE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
ALTER TYPE "Role" ADD VALUE 'IB';
ALTER TYPE "Role" ADD VALUE 'QUALITY_STAFF';

-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN     "targetGrades" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "WeekPlan" DROP COLUMN "groep",
ADD COLUMN     "classGroupId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ClassGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grades" INTEGER[],
    "schoolYear" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassGroupMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "role" "ClassGroupRole" NOT NULL DEFAULT 'GROUP_TEACHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassGroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassGroup_organizationId_idx" ON "ClassGroup"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassGroup_schoolId_schoolYear_name_key" ON "ClassGroup"("schoolId", "schoolYear", "name");

-- CreateIndex
CREATE INDEX "ClassGroupMembership_classGroupId_idx" ON "ClassGroupMembership"("classGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassGroupMembership_userId_classGroupId_key" ON "ClassGroupMembership"("userId", "classGroupId");

-- CreateIndex
CREATE INDEX "WeekPlan_classGroupId_idx" ON "WeekPlan"("classGroupId");

-- CreateIndex
CREATE INDEX "WeekPlan_schoolId_idx" ON "WeekPlan"("schoolId");

-- CreateIndex
CREATE INDEX "WeekPlan_organizationId_idx" ON "WeekPlan"("organizationId");

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroupMembership" ADD CONSTRAINT "ClassGroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroupMembership" ADD CONSTRAINT "ClassGroupMembership_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlan" ADD CONSTRAINT "WeekPlan_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- Handmatig toegevoegd (niet door Prisma gegenereerd) ----------

-- Een groep heeft minstens 1 leerjaar, en alleen leerjaren 1 t/m 8.
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_grades_check"
  CHECK ("grades" IS NOT NULL AND cardinality("grades") > 0 AND "grades" <@ ARRAY[1,2,3,4,5,6,7,8]);

-- Vaste roosteritems: leeg = alle leerjaren; anders alleen 1 t/m 8.
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_targetGrades_check"
  CHECK ("targetGrades" <@ ARRAY[1,2,3,4,5,6,7,8]);

-- RLS aan op nieuwe tabellen (app verbindt als eigenaar en wordt hierdoor niet geblokkeerd;
-- dit sluit de Supabase-API voor anon/authenticated af, zoals bij de andere tabellen).
ALTER TABLE "ClassGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassGroupMembership" ENABLE ROW LEVEL SECURITY;
