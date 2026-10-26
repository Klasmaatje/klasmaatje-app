// Lektest voor het toegangsmodel (lib/access.ts).
//
// Draaien:  npx tsx prisma/scripts/check-access.ts
//
// Maakt binnen EEN databasetransactie twee nep-besturen aan (scholen, groepen,
// gebruikers met elke rol, weekplannen, resultaten), controleert per rol wat
// zichtbaar en bewerkbaar is, en draait daarna ALLES terug. Er blijft niets
// achter in de database, ook niet als een test faalt.

import "dotenv/config";
import { PrismaClient } from "../../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AccessError,
  type Actor,
  type Db,
  classGroupScope,
  weekPlanScope,
  schoolResultScope,
  assertCanViewClassGroup,
  assertCanEditClassGroupContent,
  assertCanEditWeekPlan,
  assertCanManageSchoolGroups,
  assertCanAddGroupMember,
  assertCanManageSchoolSchedule,
  assertCanManageScheduleItem,
  canManageSchool,
  canViewWeekPlanOverview,
  assertCanApproveWeekPlan,
  canApproveWeekPlans,
  groupReflectionScope,
  clusterPlanScope,
  assertCanViewGroupReflection,
  assertCanEditGroupReflection,
  assertCanWriteClusterPlanForGroup,
  assertCanEditClusterPlan,
  assertCanFixClusterPlan,
  canViewQualityOverview,
  canUseQualityLayer,
} from "../../lib/access";
import { canApprove, canDelete, canSubmit, statusAfterEdit } from "../../lib/weekplan-status";
import {
  canEditClusterContent,
  canEvaluateClusterPlan,
  canFixClusterPlan,
  clusterStatusAfterEdit,
  parseEffect,
  parseLevel,
  subjectsFromLessons,
} from "../../lib/quality";
import { draftClusterPlan } from "../../lib/cluster-draft";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ROLLBACK = new Error("ROLLBACK");
let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FOUT  ${label} ${detail}`);
  }
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

async function expectStatus(label: string, fn: () => Promise<unknown>, status: number | "ok") {
  try {
    await fn();
    check(label, status === "ok", `(verwacht ${status}, kreeg ok)`);
  } catch (e) {
    if (e instanceof AccessError) {
      check(label, e.status === status, `(verwacht ${status}, kreeg ${e.status})`);
    } else {
      throw e;
    }
  }
}

async function run(db: Db) {
  const t = `acc${Date.now()}`; // unieke prefix, botst nooit met echte data

  // --- Twee besturen: A (met 2 scholen) en B ---
  const orgA = await db.organization.create({ data: { name: "TEST Bestuur A", slug: `${t}-a` } });
  const orgB = await db.organization.create({ data: { name: "TEST Bestuur B", slug: `${t}-b` } });
  const schoolA1 = await db.school.create({ data: { organizationId: orgA.id, name: "A1", code: `${t}-A1` } });
  const schoolA2 = await db.school.create({ data: { organizationId: orgA.id, name: "A2", code: `${t}-A2` } });
  const schoolB1 = await db.school.create({ data: { organizationId: orgB.id, name: "B1", code: `${t}-B1` } });

  const group = (schoolId: string, organizationId: string, name: string, grades: number[]) =>
    db.classGroup.create({
      data: { schoolId, organizationId, name, grades, schoolYear: "2026/2027" },
    });
  const gA1a = await group(schoolA1.id, orgA.id, "3/4", [3, 4]);
  const gA1b = await group(schoolA1.id, orgA.id, "7", [7]);
  const gA2 = await group(schoolA2.id, orgA.id, "5", [5]);
  const gB1 = await group(schoolB1.id, orgB.id, "6", [6]);

  // --- Gebruikers met elke rol ---
  let n = 0;
  const user = async (role: Actor["role"], organizationId: string | null, schoolId: string | null) => {
    const u = await db.user.create({
      data: { id: `${t}-u${++n}`, name: `Test ${role}`, email: `${t}-${n}@test.invalid`, role, organizationId, schoolId },
    });
    return { userId: u.id, role, organizationId, schoolId } satisfies Actor;
  };
  const teacher = await user("TEACHER", orgA.id, schoolA1.id); // lid van 3/4
  const duo = await user("TEACHER", orgA.id, schoolA1.id); // duo-partner in 3/4
  const teacherNoGroup = await user("TEACHER", orgA.id, schoolA1.id); // nog geen groep
  const ib = await user("IB", orgA.id, schoolA1.id);
  const director = await user("SCHOOL_ADMIN", orgA.id, schoolA1.id);
  const quality = await user("QUALITY_STAFF", orgA.id, null);
  const board = await user("BOARD", orgA.id, null);
  const platform = await user("PLATFORM_ADMIN", null, null);
  const ibOrgB = await user("IB", orgB.id, schoolB1.id);
  const teacherOrgB = await user("TEACHER", orgB.id, schoolB1.id);
  const teacherA2 = await user("TEACHER", orgA.id, schoolA2.id);

  await db.classGroupMembership.createMany({
    data: [
      { userId: teacher.userId, classGroupId: gA1a.id },
      { userId: duo.userId, classGroupId: gA1a.id },
      { userId: teacherA2.userId, classGroupId: gA2.id },
      { userId: teacherOrgB.userId, classGroupId: gB1.id },
    ],
  });

  // --- Weekplannen en resultaten ---
  const plan = (classGroupId: string, schoolId: string, organizationId: string, userId: string) =>
    db.weekPlan.create({ data: { classGroupId, schoolId, organizationId, userId, periode: "week 41" } });
  const wpA1a = await plan(gA1a.id, schoolA1.id, orgA.id, teacher.userId);
  const wpA2 = await plan(gA2.id, schoolA2.id, orgA.id, teacherA2.userId);
  const wpB1 = await plan(gB1.id, schoolB1.id, orgB.id, teacherOrgB.userId);

  const result = (schoolId: string, organizationId: string) =>
    db.schoolResult.create({
      data: { schoolId, organizationId, leerjaar: "6", vak: "CITO RW", toetsmoment: "M26", schooljaar: "2025/2026", score: 50 },
    });
  const rA1 = await result(schoolA1.id, orgA.id);
  const rA2 = await result(schoolA2.id, orgA.id);
  const rB1 = await result(schoolB1.id, orgB.id);

  const testGroupIds = [gA1a.id, gA1b.id, gA2.id, gB1.id];
  const testPlanIds = [wpA1a.id, wpA2.id, wpB1.id];
  const testResultIds = [rA1.id, rA2.id, rB1.id];

  // --- 1. Welke groepen ziet elke rol? ---
  console.log("\n1. Zichtbare groepen per rol");
  const expectGroups: [string, Actor, string[]][] = [
    ["leerkracht ziet alleen eigen groep", teacher, [gA1a.id]],
    ["duo-partner ziet dezelfde groep", duo, [gA1a.id]],
    ["leerkracht zonder groep ziet niets", teacherNoGroup, []],
    ["IB ziet alle groepen eigen school", ib, [gA1a.id, gA1b.id]],
    ["directeur ziet alle groepen eigen school", director, [gA1a.id, gA1b.id]],
    ["kwaliteitsmedewerker ziet alle scholen eigen bestuur", quality, [gA1a.id, gA1b.id, gA2.id]],
    ["bestuur ziet geen operationele groepen", board, []],
    ["IB van ander bestuur ziet alleen eigen school", ibOrgB, [gB1.id]],
    ["platformbeheer ziet alles", platform, testGroupIds],
  ];
  for (const [label, actor, expected] of expectGroups) {
    const rows = await db.classGroup.findMany({
      where: { AND: [classGroupScope(actor), { id: { in: testGroupIds } }] },
      select: { id: true },
    });
    check(label, sameSet(rows.map((r) => r.id), expected));
  }

  // --- 2. Welke weekplannen ziet elke rol? ---
  console.log("\n2. Zichtbare weekplannen per rol");
  const expectPlans: [string, Actor, string[]][] = [
    ["leerkracht ziet plan eigen groep", teacher, [wpA1a.id]],
    ["duo-partner ziet plan van collega in zelfde groep", duo, [wpA1a.id]],
    ["IB ziet plannen eigen school", ib, [wpA1a.id]],
    ["kwaliteitsmedewerker ziet plannen hele bestuur", quality, [wpA1a.id, wpA2.id]],
    ["bestuur ziet geen weekplannen", board, []],
    ["ander bestuur ziet niets van bestuur A", ibOrgB, [wpB1.id]],
  ];
  for (const [label, actor, expected] of expectPlans) {
    const rows = await db.weekPlan.findMany({
      where: { AND: [weekPlanScope(actor), { id: { in: testPlanIds } }] },
      select: { id: true },
    });
    check(label, sameSet(rows.map((r) => r.id), expected));
  }

  // --- 3. Resultaten (groepsgemiddelden) ---
  console.log("\n3. Zichtbare resultaten per rol");
  const expectResults: [string, Actor, string[]][] = [
    ["bestuur ziet resultaten eigen bestuur", board, [rA1.id, rA2.id]],
    ["kwaliteitsmedewerker ziet resultaten eigen bestuur", quality, [rA1.id, rA2.id]],
    ["IB ziet resultaten eigen school", ib, [rA1.id]],
    ["leerkracht ziet geen schoolresultaten", teacher, []],
  ];
  for (const [label, actor, expected] of expectResults) {
    const rows = await db.schoolResult.findMany({
      where: { AND: [schoolResultScope(actor), { id: { in: testResultIds } }] },
      select: { id: true },
    });
    check(label, sameSet(rows.map((r) => r.id), expected));
  }

  // --- 4. Bewerken en beheren ---
  console.log("\n4. Bewerken en beheren");
  await expectStatus("leerkracht mag eigen weekplan bewerken", () => assertCanEditWeekPlan(db, teacher, wpA1a.id), "ok");
  await expectStatus("duo-partner mag weekplan van de groep bewerken", () => assertCanEditWeekPlan(db, duo, wpA1a.id), "ok");
  await expectStatus("IB mag meekijken maar niet bewerken (403)", () => assertCanEditWeekPlan(db, ib, wpA1a.id), 403);
  await expectStatus("directeur mag plan niet bewerken (403)", () => assertCanEditClassGroupContent(db, director, gA1a.id), 403);
  await expectStatus("leerkracht zonder groep: plan bestaat niet voor hem (404)", () => assertCanEditWeekPlan(db, teacherNoGroup, wpA1a.id), 404);
  await expectStatus("ander bestuur: groep bestaat niet voor hem (404)", () => assertCanViewClassGroup(db, ibOrgB, gA1a.id), 404);
  await expectStatus("bestuur: geen toegang tot groepsdetails (404)", () => assertCanViewClassGroup(db, board, gA1a.id), 404);
  await expectStatus("directeur mag groepen eigen school beheren", () => assertCanManageSchoolGroups(db, director, schoolA1.id), "ok");
  await expectStatus("directeur mag andere school niet beheren (403)", () => assertCanManageSchoolGroups(db, director, schoolA2.id), 403);
  await expectStatus("directeur: school ander bestuur bestaat niet voor hem (404)", () => assertCanManageSchoolGroups(db, director, schoolB1.id), 404);
  await expectStatus("IB mag geen groepen beheren (403)", () => assertCanManageSchoolGroups(db, ib, schoolA1.id), 403);
  await expectStatus("directeur mag eigen leerkracht aan groep koppelen", () => assertCanAddGroupMember(db, director, gA1b.id, teacherNoGroup.userId), "ok");
  await expectStatus("directeur mag leerkracht andere school niet koppelen (403)", () => assertCanAddGroupMember(db, director, gA1b.id, teacherA2.userId), 403);
  await expectStatus("directeur mag leerkracht ander bestuur niet koppelen (403)", () => assertCanAddGroupMember(db, director, gA1b.id, teacherOrgB.userId), 403);

  // --- 5. Schoolrooster beheren (schooltijden + vaste dagonderdelen) ---
  console.log("\n5. Schoolrooster beheren");
  const item = (schoolId: string) =>
    db.scheduleItem.create({ data: { schoolId, label: "TEST gebed", defaultTime: "start/5" } });
  const itemA1 = await item(schoolA1.id);
  const itemA2 = await item(schoolA2.id);
  const itemB1 = await item(schoolB1.id);
  await expectStatus("directeur mag schoolrooster eigen school beheren", () => assertCanManageSchoolSchedule(db, director, schoolA1.id), "ok");
  await expectStatus("directeur mag rooster andere school niet beheren (403)", () => assertCanManageSchoolSchedule(db, director, schoolA2.id), 403);
  await expectStatus("directeur: rooster ander bestuur bestaat niet voor hem (404)", () => assertCanManageSchoolSchedule(db, director, schoolB1.id), 404);
  await expectStatus("IB mag schoolrooster niet beheren (403)", () => assertCanManageSchoolSchedule(db, ib, schoolA1.id), 403);
  await expectStatus("leerkracht mag schoolrooster niet beheren (403)", () => assertCanManageSchoolSchedule(db, teacher, schoolA1.id), 403);
  await expectStatus("kwaliteitsmedewerker mag schoolrooster niet beheren (403)", () => assertCanManageSchoolSchedule(db, quality, schoolA1.id), 403);
  await expectStatus("bestuur mag schoolrooster niet beheren (403)", () => assertCanManageSchoolSchedule(db, board, schoolA1.id), 403);
  await expectStatus("platformbeheer mag elk schoolrooster beheren", () => assertCanManageSchoolSchedule(db, platform, schoolB1.id), "ok");
  await expectStatus("directeur mag dagonderdeel eigen school wijzigen", () => assertCanManageScheduleItem(db, director, itemA1.id), "ok");
  await expectStatus("directeur mag dagonderdeel andere school niet wijzigen (403)", () => assertCanManageScheduleItem(db, director, itemA2.id), 403);
  await expectStatus("directeur: dagonderdeel ander bestuur bestaat niet (404)", () => assertCanManageScheduleItem(db, director, itemB1.id), 404);
  await expectStatus("IB mag dagonderdeel niet wijzigen (403)", () => assertCanManageScheduleItem(db, ib, itemA1.id), 403);
  await expectStatus("onbekend dagonderdeel (404)", () => assertCanManageScheduleItem(db, director, `${t}-bestaat-niet`), 404);

  // --- 6. Menu- en paginaregels ---
  console.log("\n6. Menu- en paginaregels");
  check("schoolbeheer alleen voor directie en platformbeheer",
    (["TEACHER", "IB", "SCHOOL_ADMIN", "QUALITY_STAFF", "BOARD", "PLATFORM_ADMIN"] as const)
      .filter(canManageSchool).join() === "SCHOOL_ADMIN,PLATFORM_ADMIN");
  check("weekplannen-overzicht voor IB, directie, kwaliteit en platformbeheer",
    (["TEACHER", "IB", "SCHOOL_ADMIN", "QUALITY_STAFF", "BOARD", "PLATFORM_ADMIN"] as const)
      .filter(canViewWeekPlanOverview).join() === "IB,SCHOOL_ADMIN,QUALITY_STAFF,PLATFORM_ADMIN");
  check("goedkeuren alleen voor IB, directie en platformbeheer",
    (["TEACHER", "IB", "SCHOOL_ADMIN", "QUALITY_STAFF", "BOARD", "PLATFORM_ADMIN"] as const)
      .filter(canApproveWeekPlans).join() === "IB,SCHOOL_ADMIN,PLATFORM_ADMIN");

  // --- 7. Weekplan goedkeuren ---
  console.log("\n7. Weekplan goedkeuren");
  await expectStatus("IB mag plan eigen school goedkeuren", () => assertCanApproveWeekPlan(db, ib, wpA1a.id), "ok");
  await expectStatus("directeur mag plan eigen school goedkeuren", () => assertCanApproveWeekPlan(db, director, wpA1a.id), "ok");
  await expectStatus("platformbeheer mag elk plan goedkeuren", () => assertCanApproveWeekPlan(db, platform, wpB1.id), "ok");
  await expectStatus("leerkracht mag eigen plan niet goedkeuren (403)", () => assertCanApproveWeekPlan(db, teacher, wpA1a.id), 403);
  await expectStatus("duo-partner mag plan niet goedkeuren (403)", () => assertCanApproveWeekPlan(db, duo, wpA1a.id), 403);
  await expectStatus("kwaliteitsmedewerker kijkt mee maar keurt niet goed (403)", () => assertCanApproveWeekPlan(db, quality, wpA2.id), 403);
  await expectStatus("IB: plan andere school bestaat niet voor hem (404)", () => assertCanApproveWeekPlan(db, ib, wpA2.id), 404);
  await expectStatus("IB ander bestuur: plan bestaat niet (404)", () => assertCanApproveWeekPlan(db, ibOrgB, wpA1a.id), 404);
  await expectStatus("bestuur mag niet goedkeuren (404)", () => assertCanApproveWeekPlan(db, board, wpA1a.id), 404);
  await expectStatus("leerkracht zonder groep: plan bestaat niet (404)", () => assertCanApproveWeekPlan(db, teacherNoGroup, wpA1a.id), 404);
  // IB die zelf in een groep staat, keurt dat plan niet zelf goed.
  await db.classGroupMembership.create({ data: { userId: ib.userId, classGroupId: gA1b.id } });
  const wpA1b = await plan(gA1b.id, schoolA1.id, orgA.id, ib.userId);
  await expectStatus("IB keurt plan van eigen groep niet zelf goed (403)", () => assertCanApproveWeekPlan(db, ib, wpA1b.id), 403);
  await expectStatus("directeur mag dat plan wel goedkeuren", () => assertCanApproveWeekPlan(db, director, wpA1b.id), "ok");

  console.log("\n8. Statusregels");
  check("concept met lessen mag worden ingediend", canSubmit("DRAFT", 3));
  check("concept zonder lessen mag niet worden ingediend", !canSubmit("DRAFT", 0));
  check("ingediend plan niet nog eens indienen", !canSubmit("SUBMITTED", 3));
  check("alleen ingediend plan goedkeuren", canApprove("SUBMITTED") && !canApprove("DRAFT") && !canApprove("APPROVED"));
  check("alleen concept verwijderen", canDelete("DRAFT") && !canDelete("SUBMITTED") && !canDelete("APPROVED"));
  check("wijziging zet plan terug op concept", statusAfterEdit() === "DRAFT");

  // --- 9. Kwaliteitslaag: groepsreflectie ---
  // Let op: sinds blok 7 is IB lid van groep gA1b (en dus niet van gA1a).
  console.log("\n9. Groepsreflectie");
  const reflection = (weekPlanId: string, classGroupId: string, schoolId: string, organizationId: string, userId: string) =>
    db.groupReflection.create({ data: { weekPlanId, classGroupId, schoolId, organizationId, userId, subject: "Rekenen" } });
  const grA1a = await reflection(wpA1a.id, gA1a.id, schoolA1.id, orgA.id, teacher.userId);
  const grA2 = await reflection(wpA2.id, gA2.id, schoolA2.id, orgA.id, teacherA2.userId);
  const grB1 = await reflection(wpB1.id, gB1.id, schoolB1.id, orgB.id, teacherOrgB.userId);
  const testReflectionIds = [grA1a.id, grA2.id, grB1.id];
  const expectReflections: [string, Actor, string[]][] = [
    ["leerkracht ziet reflectie eigen groep", teacher, [grA1a.id]],
    ["duo-partner ziet reflectie van de groep", duo, [grA1a.id]],
    ["leerkracht zonder groep ziet geen reflecties", teacherNoGroup, []],
    ["IB ziet reflecties eigen school", ib, [grA1a.id]],
    ["kwaliteitsmedewerker ziet reflecties hele bestuur", quality, [grA1a.id, grA2.id]],
    ["bestuur ziet geen reflecties", board, []],
    ["ander bestuur ziet niets van bestuur A", ibOrgB, [grB1.id]],
    ["platformbeheer ziet alle reflecties", platform, testReflectionIds],
  ];
  for (const [label, actor, expected] of expectReflections) {
    const rows = await db.groupReflection.findMany({
      where: { AND: [groupReflectionScope(actor), { id: { in: testReflectionIds } }] },
      select: { id: true },
    });
    check(label, sameSet(rows.map((r) => r.id), expected));
  }
  await expectStatus("leerkracht mag reflectie eigen groep wijzigen", () => assertCanEditGroupReflection(db, teacher, grA1a.id), "ok");
  await expectStatus("duo-partner mag reflectie van de groep wijzigen", () => assertCanEditGroupReflection(db, duo, grA1a.id), "ok");
  await expectStatus("IB leest mee maar wijzigt reflectie niet (403)", () => assertCanEditGroupReflection(db, ib, grA1a.id), 403);
  await expectStatus("kwaliteitsmedewerker wijzigt reflectie niet (403)", () => assertCanEditGroupReflection(db, quality, grA1a.id), 403);
  await expectStatus("IB: reflectie andere school bestaat niet (404)", () => assertCanViewGroupReflection(db, ib, grA2.id), 404);
  await expectStatus("ander bestuur: reflectie bestaat niet (404)", () => assertCanViewGroupReflection(db, ibOrgB, grA1a.id), 404);
  await expectStatus("bestuur: reflectie bestaat niet (404)", () => assertCanViewGroupReflection(db, board, grA1a.id), 404);

  // --- 10. Kwaliteitslaag: clusterplannen ---
  console.log("\n10. Clusterplannen");
  const cluster = (classGroupId: string, schoolId: string, organizationId: string, createdById: string) =>
    db.clusterPlan.create({
      data: { classGroupId, schoolId, organizationId, createdById, subject: "Rekenen", startPeriode: "2026-W45", evaluatiePeriode: "2026-W51" },
    });
  const cpA1a = await cluster(gA1a.id, schoolA1.id, orgA.id, teacher.userId);
  const cpA1b = await cluster(gA1b.id, schoolA1.id, orgA.id, ib.userId);
  const cpA2 = await cluster(gA2.id, schoolA2.id, orgA.id, teacherA2.userId);
  const cpB1 = await cluster(gB1.id, schoolB1.id, orgB.id, teacherOrgB.userId);
  const testClusterIds = [cpA1a.id, cpA1b.id, cpA2.id, cpB1.id];
  const expectClusters: [string, Actor, string[]][] = [
    ["leerkracht ziet clusterplan eigen groep", teacher, [cpA1a.id]],
    ["IB ziet clusterplannen eigen school", ib, [cpA1a.id, cpA1b.id]],
    ["kwaliteitsmedewerker ziet clusterplannen hele bestuur", quality, [cpA1a.id, cpA1b.id, cpA2.id]],
    ["bestuur ziet geen clusterplannen", board, []],
    ["ander bestuur ziet niets van bestuur A", ibOrgB, [cpB1.id]],
  ];
  for (const [label, actor, expected] of expectClusters) {
    const rows = await db.clusterPlan.findMany({
      where: { AND: [clusterPlanScope(actor), { id: { in: testClusterIds } }] },
      select: { id: true },
    });
    check(label, sameSet(rows.map((r) => r.id), expected));
  }
  await expectStatus("leerkracht mag clusterplan voor eigen groep maken", () => assertCanWriteClusterPlanForGroup(db, teacher, gA1a.id), "ok");
  await expectStatus("IB mag clusterplan voor groep eigen school maken", () => assertCanWriteClusterPlanForGroup(db, ib, gA1a.id), "ok");
  await expectStatus("directeur mag clusterplan eigen school maken", () => assertCanWriteClusterPlanForGroup(db, director, gA1a.id), "ok");
  await expectStatus("kwaliteitsmedewerker leest alleen (403)", () => assertCanWriteClusterPlanForGroup(db, quality, gA1a.id), 403);
  await expectStatus("leerkracht zonder groep: groep bestaat niet (404)", () => assertCanWriteClusterPlanForGroup(db, teacherNoGroup, gA1a.id), 404);
  await expectStatus("IB: groep andere school bestaat niet (404)", () => assertCanWriteClusterPlanForGroup(db, ib, gA2.id), 404);
  await expectStatus("leerkracht mag clusterplan eigen groep wijzigen", () => assertCanEditClusterPlan(db, teacher, cpA1a.id), "ok");
  await expectStatus("IB mag clusterplan eigen school wijzigen", () => assertCanEditClusterPlan(db, ib, cpA1a.id), "ok");
  await expectStatus("kwaliteitsmedewerker wijzigt clusterplan niet (403)", () => assertCanEditClusterPlan(db, quality, cpA1a.id), 403);
  await expectStatus("ander bestuur: clusterplan bestaat niet (404)", () => assertCanEditClusterPlan(db, ibOrgB, cpA1a.id), 404);
  await expectStatus("IB mag clusterplan eigen school vaststellen", () => assertCanFixClusterPlan(db, ib, cpA1a.id), "ok");
  await expectStatus("directeur mag clusterplan vaststellen", () => assertCanFixClusterPlan(db, director, cpA1a.id), "ok");
  await expectStatus("leerkracht stelt eigen clusterplan niet vast (403)", () => assertCanFixClusterPlan(db, teacher, cpA1a.id), 403);
  await expectStatus("kwaliteitsmedewerker stelt niet vast (403)", () => assertCanFixClusterPlan(db, quality, cpA1a.id), 403);
  await expectStatus("IB stelt plan van eigen groep niet zelf vast (403)", () => assertCanFixClusterPlan(db, ib, cpA1b.id), 403);
  await expectStatus("directeur mag dat plan wel vaststellen", () => assertCanFixClusterPlan(db, director, cpA1b.id), "ok");
  await expectStatus("IB: clusterplan andere school bestaat niet (404)", () => assertCanFixClusterPlan(db, ib, cpA2.id), 404);

  console.log("\n11. Regels kwaliteitslaag");
  check("IB-overzicht voor IB, directie, kwaliteit en platformbeheer",
    (["TEACHER", "IB", "SCHOOL_ADMIN", "QUALITY_STAFF", "BOARD", "PLATFORM_ADMIN"] as const)
      .filter(canViewQualityOverview).join() === "IB,SCHOOL_ADMIN,QUALITY_STAFF,PLATFORM_ADMIN");
  check("kwaliteitslaag in menu voor iedereen behalve bestuur",
    (["TEACHER", "IB", "SCHOOL_ADMIN", "QUALITY_STAFF", "BOARD", "PLATFORM_ADMIN"] as const)
      .filter(canUseQualityLayer).join() === "TEACHER,IB,SCHOOL_ADMIN,QUALITY_STAFF,PLATFORM_ADMIN");
  check("inschatting: alleen bekende waarden", parseLevel("DEELS") === "DEELS" && parseLevel("ROOD") === null && parseLevel("") === null);
  check("effect: alleen bekende waarden", parseEffect("JA") === "JA" && parseEffect("groen") === null);
  check("vakken uit lessen: zonder routines, uniek, gesorteerd",
    subjectsFromLessons([
      { type: "les", subject: "Taal" }, { type: "routine", subject: "Kring" },
      { type: "toets", subject: "Rekenen" }, { type: "les", subject: "Rekenen" },
    ]).join() === "Rekenen,Taal");
  check("clusterplan: alleen concept vaststellen", canFixClusterPlan("DRAFT") && !canFixClusterPlan("VASTGESTELD") && !canFixClusterPlan("GEEVALUEERD"));
  check("clusterplan: alleen vastgesteld evalueren", canEvaluateClusterPlan("VASTGESTELD") && !canEvaluateClusterPlan("DRAFT"));
  check("clusterplan: na evaluatie geen inhoud meer wijzigen", canEditClusterContent("DRAFT") && canEditClusterContent("VASTGESTELD") && !canEditClusterContent("GEEVALUEERD"));
  check("clusterplan: wijziging zet terug op concept", clusterStatusAfterEdit() === "DRAFT");

  console.log("\n12. Conceptvoorstel clusterplan (herleidbaar)");
  const draft = draftClusterPlan("Rekenen", [
    { periode: "2026-W44", basis: "GEHAALD", verlengd: "DEELS", verrijking: "GEHAALD", aandacht: "Gelijknamig maken.", vervolg: "Herhaling op maandag." },
    { periode: "2026-W43", basis: "DEELS", verlengd: "NOG_NIET", verrijking: null, aandacht: "Gelijknamig maken.", vervolg: null },
  ], "Rekenen: 1F eind groep 6");
  check("concept: aandachtspunt uit reflectie komt terug (een keer)", draft.intensiefDoel.split("Gelijknamig maken.").length === 2);
  check("concept: herleidbaar naar weken", draft.intensiefDoel.includes("in 2 van de 2 reflecties (week 44, week 43)"));
  check("concept: meegenomen vervolg in aanpak", draft.intensiefAanpak.includes("Herhaling op maandag."));
  check("concept: kwaliteitsdoel genoemd", draft.basisDoel.includes("Rekenen: 1F eind groep 6"));
  check("concept zonder reflecties: geen verzonnen tellingen", !draftClusterPlan("Taal", []).basisDoel.includes("reflecties"));
}

async function main() {
  console.log("Lektest toegangsmodel (alles wordt teruggedraaid)");
  try {
    await prisma.$transaction(
      async (tx) => {
        await run(tx);
        throw ROLLBACK;
      },
      { timeout: 120_000, maxWait: 20_000 }
    );
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }

  console.log(`\n${passed} geslaagd, ${failures.length} mislukt. Database ongewijzigd (rollback).`);
  if (failures.length > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
