/*
  Warnings:

  - You are about to drop the `OrganizationMethod` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'BOARD';

-- DropForeignKey
ALTER TABLE "OrganizationMethod" DROP CONSTRAINT "OrganizationMethod_methodId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationMethod" DROP CONSTRAINT "OrganizationMethod_organizationId_fkey";

-- AlterTable
ALTER TABLE "Method" ADD COLUMN     "sloMapping" TEXT[],
ADD COLUMN     "subjectArea" TEXT;

-- AlterTable
ALTER TABLE "SchoolConfig" ADD COLUMN     "oppSupportEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parnasSysEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "studentDataMode" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "studentLevelAnalysisEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "schoolId" TEXT;

-- DropTable
DROP TABLE "OrganizationMethod";

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMethod" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "defaultTime" TEXT,
    "category" TEXT NOT NULL DEFAULT 'routine',
    "aiHint" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "methodId" TEXT,
    "groep" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "thema" TEXT,
    "bijzonderheden" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "weekPlanId" TEXT NOT NULL,
    "dag" TEXT NOT NULL,
    "timeSlot" TEXT,
    "type" TEXT NOT NULL DEFAULT 'les',
    "subject" TEXT NOT NULL,
    "cooperativeStrategy" TEXT,
    "goalBasis" TEXT,
    "goalVerlengd" TEXT,
    "goalVerrijking" TEXT,
    "targetGroup" TEXT,
    "frequency" TEXT,
    "materials" TEXT,
    "didacticStrategy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolResult" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "leerjaar" TEXT NOT NULL,
    "vak" TEXT NOT NULL,
    "toetsmoment" TEXT NOT NULL,
    "schooljaar" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "aantalLln" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_code_key" ON "School"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMethod_schoolId_methodId_key" ON "SchoolMethod"("schoolId", "methodId");

-- CreateIndex
CREATE INDEX "SchoolResult_organizationId_idx" ON "SchoolResult"("organizationId");

-- CreateIndex
CREATE INDEX "SchoolResult_schoolId_idx" ON "SchoolResult"("schoolId");

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMethod" ADD CONSTRAINT "SchoolMethod_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMethod" ADD CONSTRAINT "SchoolMethod_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "Method"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlan" ADD CONSTRAINT "WeekPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlan" ADD CONSTRAINT "WeekPlan_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlan" ADD CONSTRAINT "WeekPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlan" ADD CONSTRAINT "WeekPlan_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "Method"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_weekPlanId_fkey" FOREIGN KEY ("weekPlanId") REFERENCES "WeekPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResult" ADD CONSTRAINT "SchoolResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResult" ADD CONSTRAINT "SchoolResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
