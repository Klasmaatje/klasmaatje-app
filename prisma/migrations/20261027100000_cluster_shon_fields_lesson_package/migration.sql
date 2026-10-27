-- Blok D: AI in clusterplannen (SHON-format, kwaliteitskaart OP2 h. 6) en lespakketten.
-- Alleen ADDITIEF: nieuwe kolommen (allemaal optioneel) op ClusterPlan en een nieuwe tabel.
-- Groepsniveau, GEEN leerlingdata.

-- AlterTable: vaste SHON-velden voor het clusterplan
ALTER TABLE "ClusterPlan" ADD COLUMN "analyse" TEXT;
ALTER TABLE "ClusterPlan" ADD COLUMN "uitvoering" TEXT;
ALTER TABLE "ClusterPlan" ADD COLUMN "vervolgbesluit" TEXT;
ALTER TABLE "ClusterPlan" ADD COLUMN "volgendeControle" TEXT;
ALTER TABLE "ClusterPlan" ADD COLUMN "conceptBron" TEXT;

ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_uitvoering_check"
  CHECK ("uitvoering" IS NULL OR "uitvoering" IN ('JA', 'DEELS', 'NEE'));
ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_vervolgbesluit_check"
  CHECK ("vervolgbesluit" IS NULL OR "vervolgbesluit" IN ('VOORTZETTEN', 'AANPASSEN', 'INTENSIVEREN', 'AFRONDEN'));

-- CreateTable: lespakket (concept-lesvoorbereiding door AI, gecontroleerd door de leerkracht)
CREATE TABLE "LessonPackage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "lessonId" TEXT,
    "createdById" TEXT NOT NULL,
    "grades" INTEGER[],
    "subject" TEXT NOT NULL,
    "learningGoal" TEXT NOT NULL,
    "method" TEXT,
    "minutes" INTEGER NOT NULL,
    "focus" TEXT,
    "content" JSONB NOT NULL,
    "checks" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonPackage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LessonPackage_minutes_check" CHECK ("minutes" BETWEEN 10 AND 180),
    CONSTRAINT "LessonPackage_status_check" CHECK ("status" IN ('DRAFT', 'GEBRUIKT'))
);

-- CreateIndex
CREATE INDEX "LessonPackage_classGroupId_idx" ON "LessonPackage"("classGroupId");
CREATE INDEX "LessonPackage_schoolId_idx" ON "LessonPackage"("schoolId");
CREATE INDEX "LessonPackage_organizationId_idx" ON "LessonPackage"("organizationId");
CREATE INDEX "LessonPackage_lessonId_idx" ON "LessonPackage"("lessonId");

-- AddForeignKey
ALTER TABLE "LessonPackage" ADD CONSTRAINT "LessonPackage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonPackage" ADD CONSTRAINT "LessonPackage_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonPackage" ADD CONSTRAINT "LessonPackage_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonPackage" ADD CONSTRAINT "LessonPackage_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LessonPackage" ADD CONSTRAINT "LessonPackage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security aan (zelfde lijn als de andere tabellen; de app gebruikt de servicerol)
ALTER TABLE "LessonPackage" ENABLE ROW LEVEL SECURITY;
