-- Kwaliteitslaag fase 2: groepsreflectie en clusterplannen (groepsniveau, GEEN leerlingdata).

-- CreateTable
CREATE TABLE "GroupReflection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "weekPlanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "basis" TEXT,
    "verlengd" TEXT,
    "verrijking" TEXT,
    "goed" TEXT,
    "aandacht" TEXT,
    "vervolg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupReflection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "startPeriode" TEXT NOT NULL,
    "evaluatiePeriode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "basisDoel" TEXT,
    "basisAanpak" TEXT,
    "intensiefDoel" TEXT,
    "intensiefAanpak" TEXT,
    "verrijkingDoel" TEXT,
    "verrijkingAanpak" TEXT,
    "evaluatie" TEXT,
    "effect" TEXT,
    "vastgesteldById" TEXT,
    "vastgesteldAt" TIMESTAMP(3),
    "geevalueerdAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClusterPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupReflection_classGroupId_idx" ON "GroupReflection"("classGroupId");

-- CreateIndex
CREATE INDEX "GroupReflection_schoolId_idx" ON "GroupReflection"("schoolId");

-- CreateIndex
CREATE INDEX "GroupReflection_organizationId_idx" ON "GroupReflection"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupReflection_weekPlanId_subject_key" ON "GroupReflection"("weekPlanId", "subject");

-- CreateIndex
CREATE INDEX "ClusterPlan_classGroupId_idx" ON "ClusterPlan"("classGroupId");

-- CreateIndex
CREATE INDEX "ClusterPlan_schoolId_idx" ON "ClusterPlan"("schoolId");

-- CreateIndex
CREATE INDEX "ClusterPlan_organizationId_idx" ON "ClusterPlan"("organizationId");

-- AddForeignKey
ALTER TABLE "GroupReflection" ADD CONSTRAINT "GroupReflection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupReflection" ADD CONSTRAINT "GroupReflection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupReflection" ADD CONSTRAINT "GroupReflection_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupReflection" ADD CONSTRAINT "GroupReflection_weekPlanId_fkey" FOREIGN KEY ("weekPlanId") REFERENCES "WeekPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupReflection" ADD CONSTRAINT "GroupReflection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_vastgesteldById_fkey" FOREIGN KEY ("vastgesteldById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- Handmatig toegevoegd (niet door Prisma gegenereerd) ----------

-- Alleen bekende waarden voor inschattingen, status en effect.
ALTER TABLE "GroupReflection" ADD CONSTRAINT "GroupReflection_levels_check"
  CHECK (("basis" IS NULL OR "basis" IN ('GEHAALD','DEELS','NOG_NIET'))
     AND ("verlengd" IS NULL OR "verlengd" IN ('GEHAALD','DEELS','NOG_NIET'))
     AND ("verrijking" IS NULL OR "verrijking" IN ('GEHAALD','DEELS','NOG_NIET')));

ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_status_check"
  CHECK ("status" IN ('DRAFT','VASTGESTELD','GEEVALUEERD'));

ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_effect_check"
  CHECK ("effect" IS NULL OR "effect" IN ('JA','DEELS','NEE'));

-- Evaluatiemoment ligt niet voor de start (ISO-weken "YYYY-Www" sorteren als tekst).
ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_periode_check"
  CHECK ("startPeriode" ~ '^[0-9]{4}-W[0-9]{2}$' AND "evaluatiePeriode" ~ '^[0-9]{4}-W[0-9]{2}$'
     AND "evaluatiePeriode" >= "startPeriode");

-- RLS aan op nieuwe tabellen (app verbindt als eigenaar en wordt hierdoor niet geblokkeerd;
-- dit sluit de Supabase-API voor anon/authenticated af, zoals bij de andere tabellen).
ALTER TABLE "GroupReflection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClusterPlan" ENABLE ROW LEVEL SECURITY;

-- ---------- Kwaliteitsdoelen (toegevoegd 26 okt, zelfde migratie) ----------

-- CreateTable
CREATE TABLE "QualityGoal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "norm" TEXT,
    "subject" TEXT,
    "validFromYear" INTEGER NOT NULL,
    "validToYear" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityGoal_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ClusterPlan" ADD COLUMN "qualityGoalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "QualityGoal_organizationId_code_key" ON "QualityGoal"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ClusterPlan_qualityGoalId_idx" ON "ClusterPlan"("qualityGoalId");

-- AddForeignKey
ALTER TABLE "QualityGoal" ADD CONSTRAINT "QualityGoal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterPlan" ADD CONSTRAINT "ClusterPlan_qualityGoalId_fkey" FOREIGN KEY ("qualityGoalId") REFERENCES "QualityGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ClusterPlanSource" (
    "clusterPlanId" TEXT NOT NULL,
    "reflectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClusterPlanSource_pkey" PRIMARY KEY ("clusterPlanId","reflectionId")
);

-- CreateIndex
CREATE INDEX "ClusterPlanSource_reflectionId_idx" ON "ClusterPlanSource"("reflectionId");

-- AddForeignKey
ALTER TABLE "ClusterPlanSource" ADD CONSTRAINT "ClusterPlanSource_clusterPlanId_fkey" FOREIGN KEY ("clusterPlanId") REFERENCES "ClusterPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterPlanSource" ADD CONSTRAINT "ClusterPlanSource_reflectionId_fkey" FOREIGN KEY ("reflectionId") REFERENCES "GroupReflection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Geldigheidsperiode: eindjaar niet voor beginjaar.
ALTER TABLE "QualityGoal" ADD CONSTRAINT "QualityGoal_validity_check"
  CHECK ("validToYear" IS NULL OR "validToYear" >= "validFromYear");

ALTER TABLE "QualityGoal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClusterPlanSource" ENABLE ROW LEVEL SECURITY;
