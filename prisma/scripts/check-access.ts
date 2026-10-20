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
} from "../../lib/access";

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
