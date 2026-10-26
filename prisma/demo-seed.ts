// DEMO-seed: "SHON (demo)" met de echte SHON-scholen, schooltijden, groepen en
// SBP-kwaliteitsdoelen, en FICTIEVE inhoud (accounts, weekplannen, reflecties,
// clusterplannen, evaluaties) voor demonstraties aan bestuur en kwaliteit.
// Draait UITSLUITEND op de aparte demodatabase (Supabase-project klasmaatje-demo).
// Accountnamen zijn rolnamen ("Leerkracht 5a (demo)"), zodat ze niet op echte
// collega's lijken. Geen leerlinggegevens.
//
// Draaien:  npm run demo:seed   (laadt .env.demo; DEMO_MODE=1 verplicht)
//
// Veiligheid:
// - weigert zonder DEMO_MODE=1;
// - weigert als DATABASE_URL naar het SHON-project wijst;
// - weigert als er een organisatie met slug "shon" in de database staat.
// Bij opnieuw draaien wordt het demo-bestuur eerst helemaal verwijderd en opnieuw
// opgebouwd (datums relatief aan vandaag). Andere gegevens worden niet aangeraakt.
//
// Accounts: één demowachtwoord voor alle demo-accounts. Staat DEMO_PASSWORD in
// .env.demo, dan wordt dat gebruikt; anders wordt er een gemaakt. Wachtwoord en
// accounts worden weggeschreven in .demo-accounts.txt (niet in git).

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { GLOBAL_METHODS } from "./data/methods";
import { SCHEDULE_ITEM_TEMPLATES } from "./data/schedule-items";
import { resolveDayForGroup, toMinutes, fromMinutes } from "../lib/schedule-items";
import { freeBlocks } from "../lib/ai/free-blocks";
import { WEEKDAYS, isoWeekOf, periodeKey, todayInNetherlands, schoolYearOf } from "../lib/week";
import { draftClusterPlan } from "../lib/cluster-draft";
import { parseLevel } from "../lib/quality";

const SHON_PROJECT_REF = "naeijrpkbjlrcrdxaids";
const DEMO_SLUG = "shon-demo";
const MAIL = "demo.klasmaatje.test";

function guard() {
  if (process.env.DEMO_MODE !== "1") {
    console.error("Geweigerd: DEMO_MODE=1 ontbreekt. Draai dit alleen via `npm run demo:seed` met .env.demo.");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    console.error("Geweigerd: DATABASE_URL ontbreekt in .env.demo.");
    process.exit(1);
  }
  if (url.includes(SHON_PROJECT_REF)) {
    console.error("Geweigerd: DATABASE_URL wijst naar de SHON-database. De demo hoort in een eigen project.");
    process.exit(1);
  }
}
guard();

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const DAY_MS = 86_400_000;

function weekKey(offset: number): string {
  const { year, week } = isoWeekOf(new Date(todayInNetherlands().getTime() + offset * 7 * DAY_MS));
  return periodeKey(year, week);
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

// ---------- Fictief bestuur ----------

type DayRow = { dayOfWeek: string; startTime: string; endTime: string; breakStart: string | null; breakEnd: string | null };
const week = (start: string, end: string, wedEnd: string, lunch: [string, string] | null): DayRow[] =>
  WEEKDAYS.map((d) => ({
    dayOfWeek: d,
    startTime: start,
    endTime: d === "WEDNESDAY" ? wedEnd : end,
    breakStart: d === "WEDNESDAY" || !lunch ? null : lunch[0],
    breakEnd: d === "WEDNESDAY" || !lunch ? null : lunch[1],
  }));

// Echte SHON-scholen met schooltijden en groepen 2026/2027 (zelfde bron als prisma/seed.ts).
const SCHOOLS = [
  { code: "SGS", name: "Shri Ganesha School", days: week("08:45", "15:00", "12:45", ["12:30", "13:00"]),
    groups: [["0/1/2", [1, 2]], ["3", [3]], ["4/5", [4, 5]], ["6/7", [6, 7]], ["8", [8]]] },
  { code: "SSS", name: "Shri Saraswatie School", days: week("08:45", "14:30", "13:00", ["12:00", "12:45"]),
    groups: [["1/2a", [1, 2]], ["1/2b", [1, 2]], ["3", [3]], ["4/5", [4, 5]], ["6", [6]], ["7", [7]], ["8", [8]]] },
  { code: "SKS", name: "Shri Krishna School", days: week("08:45", "15:00", "12:30", null),
    groups: [["1/2", [1, 2]], ["3/4", [3, 4]], ["5/6", [5, 6]], ["7/8", [7, 8]]] },
  { code: "SVS", name: "Shri Vishnu School", days: week("08:40", "15:00", "12:30", ["12:30", "13:00"]),
    groups: [["1", [1]], ["2a", [2]], ["2b", [2]], ["3a", [3]], ["3b", [3]], ["4a", [4]], ["4b", [4]], ["5a", [5]], ["5b", [5]],
      ["6a", [6]], ["6b", [6]], ["7a", [7]], ["7b", [7]], ["8a", [8]], ["8b", [8]]] },
  { code: "SLS", name: "Shri Laksmi School", days: week("08:30", "14:15", "14:15", null),
    groups: [["1", [1]], ["2", [2]], ["3", [3]], ["4", [4]], ["5", [5]], ["6a", [6]], ["6b", [6]], ["7", [7]], ["8a", [8]], ["8b", [8]]] },
] as const;

const GOALS = [
  {
    code: "REK-1F", subject: "Rekenen",
    title: "Rekenen: 1F eind groep 6, 75% 1S bij uitstroom",
    source: "Strategisch Beleidsplan SHON 2025-2029, Ambitie Rekenen (p. 17)",
    norm: "Wij vinden dat elke leerling eind groep 6 het niveau van 1F behaald moet hebben (uitzonderingen van zorgleerlingen daargelaten). Eind groep 8, is het onze ambitie, dat 75% van onze leerlingen uitstromen op 1S niveau.",
  },
  {
    code: "TAAL-2F", subject: "Begrijpend lezen",
    title: "Taal en begrijpend lezen: 1F eind groep 6, 85% 2F bij uitstroom",
    source: "Strategisch Beleidsplan SHON 2025-2029, Ambitie Taal (p. 19)",
    norm: "Wij vinden dat elke leerling eind groep 6 het niveau van 1F behaald moet hebben (uitzonderingen van zorgleerlingen daargelaten). Eind groep 8, is het onze ambitie, dat 85% van onze leerlingen uitstromen op 2F niveau.",
  },
  {
    code: "EDI-CVB", subject: null,
    title: "EDI: controle van begrip, verlengde en verdiepende instructie",
    source: "Strategisch Beleidsplan SHON 2025-2029, Ambitie EDI (p. 21)",
    norm: "Leraren controleren begrip: wisbordjes, willekeurige beurten. Er wordt een verdiepende en verlengde instructie gerealiseerd om tegemoet te komen aan sterke en zwakke leerlingen.",
  },
];

// ---------- Lesinhoud (fictief, per vak een korte reeks) ----------

type LessonContent = { subject: string; minutes: number; basis: string; verlengd: string; verrijking: string };

function lessonsFor(grades: number[], weekIndex: number): LessonContent[][] {
  const kleuter = grades.some((g) => g <= 2);
  const g = Math.max(...grades);
  if (kleuter) {
    const tel = [5, 10, 10, 10][weekIndex] ?? 10;
    return WEEKDAYS.map(() => [
      { subject: "Taalkring", minutes: 20, basis: "Ik kan drie nieuwe themawoorden gebruiken in een zin.", verlengd: "Weergroepje: ik kan twee themawoorden aanwijzen en zeggen.", verrijking: "Meergroepje: ik kan een kort verhaaltje vertellen met themawoorden." },
      { subject: "Rekenkring", minutes: 20, basis: `Ik kan tot ${tel} tellen en hoeveelheden tot ${tel} aanwijzen.`, verlengd: "Weergroepje: ik kan tot 5 tellen en wijzen tegelijk.", verrijking: "Meergroepje: ik kan tot 20 tellen en terugtellen vanaf 10." },
      { subject: "Spelen en werken in hoeken", minutes: 45, basis: "Ik kan in de themahoek samen spelen en een opdracht afmaken.", verlengd: "Weergroepje: ik speel met de leerkracht in de hoek mee.", verrijking: "Meergroepje: ik bedenk zelf een nieuwe rol of opdracht in de hoek." },
      { subject: "Bewegen", minutes: 30, basis: "Ik kan rennen, stoppen en draaien op een teken.", verlengd: "Weergroepje: ik oefen stoppen op een teken met voorbeelden.", verrijking: "Meergroepje: ik bedenk zelf een beweging voor de groep." },
    ]);
  }
  const rekenen = g <= 4
    ? ["optellen tot 100 met tientallen", "aftrekken tot 100 met tientallen", "optellen en aftrekken over het tiental", "rekenverhalen tot 100"][weekIndex]
    : g <= 6
      ? ["breuken herkennen en benoemen", "breuken met dezelfde noemer vergelijken", "breuken op de getallenlijn", "gelijkwaardige breuken"][weekIndex]
      : ["procenten en breuken koppelen", "procenten van een hoeveelheid", "kortingen berekenen", "verhoudingstabellen"][weekIndex];
  const lezen = ["de hoofdgedachte van een alinea vinden", "signaalwoorden herkennen", "de hoofdgedachte van een tekst formuleren", "feit en mening onderscheiden"][weekIndex];
  return WEEKDAYS.map((d, i) => [
    { subject: "Automatiseren rekenen", minutes: 10, basis: "Ik kan 20 sommen vlot en foutloos uitrekenen.", verlengd: "Ik oefen de sommen met het rekenrek.", verrijking: "Ik maak een eigen reeks sommen voor een klasgenoot." },
    { subject: "Rekenen", minutes: 60, basis: `Ik kan ${rekenen}.`, verlengd: `Verlengde instructie aan de instructietafel met materiaal: ${rekenen}.`, verrijking: `Ik pas ${rekenen} toe in een open probleem en leg mijn aanpak uit.` },
    i % 2 === 0
      ? { subject: "Begrijpend lezen", minutes: 45, basis: `Ik kan ${lezen}.`, verlengd: "Hardop denkend samen lezen met de leerkracht, pen in de hand.", verrijking: "Ik vergelijk twee teksten over hetzelfde onderwerp." }
      : { subject: "Spelling", minutes: 45, basis: "Ik kan de spellingcategorie van deze week goed toepassen.", verlengd: "Extra dictee aan de instructietafel met klankgebaren.", verrijking: "Ik zoek uitzonderingen en leg de regel uit." },
    d === "WEDNESDAY"
      ? { subject: "Dharma", minutes: 30, basis: "Ik kan vertellen wat het verhaal van deze week betekent voor hoe we met elkaar omgaan.", verlengd: "Ik bespreek het verhaal met een maatje met plaatjes.", verrijking: "Ik verbind het verhaal met een eigen ervaring." }
      : { subject: i % 2 === 0 ? "Wereldoriëntatie" : "Taal", minutes: 45, basis: "Ik kan het lesdoel van vandaag uitleggen met de begrippen van het thema.", verlengd: "Begeleid oefenen met een woordweb.", verrijking: "Ik zoek extra informatie en presenteer die kort." },
  ]);
}

// ---------- Reflecties (fictief, groepsniveau, zonder namen) ----------

type Refl = { weekOffset: number; subject: string; basis: string | null; verlengd: string | null; verrijking: string | null; goed: string; aandacht: string; vervolg: string };

const REFLECTIONS: Record<string, Refl[]> = {
  "SVS/5a": [
    { weekOffset: -3, subject: "Rekenen", basis: "DEELS", verlengd: "NOG_NIET", verrijking: "GEHAALD", goed: "De breukenstroken hielpen om delen van een geheel te zien.", aandacht: "Een groepje verwart teller en noemer.", vervolg: "Dagelijks starten met teller en noemer benoemen op het wisbordje." },
    { weekOffset: -2, subject: "Rekenen", basis: "GEHAALD", verlengd: "DEELS", verrijking: "GEHAALD", goed: "Vergelijken met dezelfde noemer gaat bij de meeste leerlingen goed.", aandacht: "Bij de verlengde instructie lukt het nog niet zonder strook.", vervolg: "Verlengde instructie: van strook naar tekening naar getallen." },
    { weekOffset: -1, subject: "Rekenen", basis: "GEHAALD", verlengd: "DEELS", verrijking: "GEHAALD", goed: "Controle van begrip met wisbordjes liet snel zien wie extra instructie nodig had.", aandacht: "Breuken op de getallenlijn plaatsen blijft lastig voor een groepje.", vervolg: "Twee keer per week korte herhaling getallenlijn aan de instructietafel." },
    { weekOffset: -2, subject: "Begrijpend lezen", basis: "GEHAALD", verlengd: "DEELS", verrijking: "GEHAALD", goed: "Hardop denkend modelleren werkte goed.", aandacht: "Signaalwoorden worden nog vaak overgeslagen.", vervolg: "Signaalwoorden laten markeren met de pen in de hand." },
  ],
  "SVS/7a": [
    { weekOffset: -7, subject: "Begrijpend lezen", basis: "DEELS", verlengd: "NOG_NIET", verrijking: "DEELS", goed: "De leerlingen waren betrokken bij de teksten over duurzaamheid.", aandacht: "Hoofdgedachte en onderwerp worden door elkaar gehaald.", vervolg: "Verschil onderwerp en hoofdgedachte expliciet modelleren." },
    { weekOffset: -6, subject: "Begrijpend lezen", basis: "DEELS", verlengd: "DEELS", verrijking: "GEHAALD", goed: "Werken met de kernzin per alinea hielp.", aandacht: "Een groepje schrijft nog een detail op als hoofdgedachte.", vervolg: "Verlengde instructie met kortere teksten." },
    { weekOffset: -2, subject: "Begrijpend lezen", basis: "GEHAALD", verlengd: "DEELS", verrijking: "GEHAALD", goed: "De meeste leerlingen formuleren de hoofdgedachte in eigen woorden.", aandacht: "Bij langere teksten zakt het nog in.", vervolg: "Lange teksten opdelen en per deel samenvatten." },
  ],
  "SVS/1": [
    { weekOffset: -1, subject: "Rekenkring", basis: "GEHAALD", verlengd: "DEELS", verrijking: "GEHAALD", goed: "Tellen met kastanjes was een succes.", aandacht: "Het weergroepje telt nog niet synchroon.", vervolg: "Weergroepje dagelijks 5 minuten tellen en wijzen in de hoek." },
  ],
  "SKS/5/6": [
    { weekOffset: -2, subject: "Rekenen", basis: "DEELS", verlengd: "NOG_NIET", verrijking: "GEHAALD", goed: "Het werken met het rekenrek ging goed.", aandacht: "Breuken vergelijken lukt een groepje nog niet.", vervolg: "Extra instructie op dinsdag en donderdag." },
    { weekOffset: -1, subject: "Rekenen", basis: "GEHAALD", verlengd: "DEELS", verrijking: "GEHAALD", goed: "Vooruitgang bij vergelijken met dezelfde noemer.", aandacht: "Ongelijke noemers zijn nog te moeilijk voor het intensieve groepje.", vervolg: "Eerst gelijke noemers borgen." },
  ],
  "SLS/6a": [
    { weekOffset: -3, subject: "Rekenen", basis: "GEHAALD", verlengd: "DEELS", verrijking: "GEHAALD", goed: "Automatiseren aan het begin van de les gaf rust.", aandacht: "Deelsommen met rest blijven lastig.", vervolg: "Deelsommen met materiaal herhalen." },
  ],
  "SGS/4/5": [
    { weekOffset: -1, subject: "Spelling", basis: "DEELS", verlengd: "NOG_NIET", verrijking: "GEHAALD", goed: "Klankgebaren hielpen bij het dictee.", aandacht: "Woorden met -ng en -nk worden verwisseld.", vervolg: "Dagelijks vijf woorden -ng/-nk met klankgebaar." },
  ],
  "SSS/7": [
    { weekOffset: -4, subject: "Begrijpend lezen", basis: "DEELS", verlengd: "DEELS", verrijking: "GEHAALD", goed: "Voorspellen voor het lezen werkte motiverend.", aandacht: "Samenvatten blijft lastig.", vervolg: "Samenvatten modelleren met drie kernzinnen." },
  ],
};

// Teachers per groep (fictieve namen). Sleutel = schoolcode/groepsnaam.
const TEACHERS: { key: string; name: string; email: string }[] = [
  { key: "SVS/1", name: "Leerkracht groep 1 (demo)", email: `leerkracht.svs1@${MAIL}` },
  { key: "SVS/5a", name: "Leerkracht groep 5a (demo)", email: `leerkracht.svs5a@${MAIL}` },
  { key: "SVS/7a", name: "Leerkracht groep 7a (demo)", email: `leerkracht.svs7a@${MAIL}` },
  { key: "SKS/5/6", name: "Leerkracht groep 5/6 Shri Krishna (demo)", email: `leerkracht.sks@${MAIL}` },
  { key: "SLS/6a", name: "Leerkracht groep 6a Shri Laksmi (demo)", email: `leerkracht.sls@${MAIL}` },
  { key: "SGS/4/5", name: "Leerkracht groep 4/5 Shri Ganesha (demo)", email: `leerkracht.sgs@${MAIL}` },
  { key: "SSS/7", name: "Leerkracht groep 7 Shri Saraswatie (demo)", email: `leerkracht.sss@${MAIL}` },
];

async function removeDemo() {
  const org = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } });
  if (!org) return;
  const where = { organizationId: org.id };
  await prisma.clusterPlanSource.deleteMany({ where: { clusterPlan: where } });
  await prisma.clusterPlan.deleteMany({ where });
  await prisma.groupReflection.deleteMany({ where });
  await prisma.lesson.deleteMany({ where: { weekPlan: where } });
  await prisma.weekPlan.deleteMany({ where });
  await prisma.classGroupMembership.deleteMany({ where: { classGroup: where } });
  await prisma.qualityGoal.deleteMany({ where });
  const schools = await prisma.school.findMany({ where, select: { id: true } });
  const schoolIds = schools.map((s) => s.id);
  await prisma.user.deleteMany({ where }); // sessies en accounts gaan mee (cascade)
  await prisma.classGroup.deleteMany({ where });
  await prisma.scheduleItem.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await prisma.schoolDaySchedule.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await prisma.schoolMethod.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await prisma.schoolResult.deleteMany({ where });
  await prisma.school.deleteMany({ where });
  await prisma.schoolConfig.deleteMany({ where });
  await prisma.organization.delete({ where: { id: org.id } });
}

async function main() {
  // Het echte SHON-bestuur heeft slug "shon" (prisma/seed.ts); de demo heet "shon-demo".
  if (await prisma.organization.findUnique({ where: { slug: "shon" } })) {
    console.error("Geweigerd: deze database bevat het SHON-bestuur. De demo hoort in een eigen database.");
    process.exitCode = 1;
    return;
  }
  console.log("Demo-seed (fictieve gegevens)");
  await removeDemo();

  const password = process.env.DEMO_PASSWORD || `Demo-${randomBytes(6).toString("base64url")}`;
  const passwordHash = await hashPassword(password);
  const schoolYear = schoolYearOf(todayInNetherlands());

  // Methode-catalogus (globaal; nodig voor een lege database)
  for (const m of GLOBAL_METHODS) {
    await prisma.method.upsert({
      where: { name: m.name },
      update: {},
      create: { name: m.name, subject: m.subject, subjectArea: m.subject, publisher: m.publisher, description: m.description },
    });
  }

  const org = await prisma.organization.create({
    data: {
      name: "Stichting Hindoe Onderwijs Nederland (demo)",
      slug: DEMO_SLUG,
      config: { create: { aiProvider: "openai", microAnalyseLabel: "Micro-analyse", qualityFramework: "SLO-kerndoelen" } },
    },
  });

  const goals: Record<string, string> = {};
  for (const g of GOALS) {
    const goal = await prisma.qualityGoal.create({
      data: { organizationId: org.id, code: g.code, title: g.title, source: g.source, norm: g.norm, subject: g.subject, validFromYear: 2025, validToYear: 2029 },
    });
    goals[g.code] = goal.id;
  }

  // Scholen, roosters, vaste dagonderdelen, groepen
  const groupIds: Record<string, { id: string; schoolId: string; grades: number[] }> = {};
  const schoolInfo: Record<string, { id: string }> = {};
  for (const s of SCHOOLS) {
    const school = await prisma.school.create({ data: { organizationId: org.id, code: s.code, name: s.name, rosterType: "TRADITIONAL" } });
    schoolInfo[s.code] = { id: school.id };
    await prisma.schoolDaySchedule.createMany({ data: s.days.map((d) => ({ schoolId: school.id, ...d })) as never });
    await prisma.scheduleItem.createMany({
      data: SCHEDULE_ITEM_TEMPLATES.map((t) => ({
        schoolId: school.id, label: t.label, defaultTime: t.defaultTime, category: t.category,
        targetGrades: t.targetGrades, sortOrder: t.sortOrder, aiHint: t.aiHint,
      })),
    });
    for (const [name, grades] of s.groups) {
      const g = await prisma.classGroup.create({
        data: { organizationId: org.id, schoolId: school.id, name, grades: [...grades], schoolYear },
      });
      groupIds[`${s.code}/${name}`] = { id: g.id, schoolId: school.id, grades: [...grades] };
    }
  }

  // Accounts
  const accounts: { name: string; email: string; role: string; school: string }[] = [];
  async function user(name: string, email: string, role: string, schoolCode: string | null) {
    const id = newId();
    await prisma.user.create({
      data: {
        id, name, email, emailVerified: true, role: role as never, organizationId: org.id,
        schoolId: schoolCode ? schoolInfo[schoolCode].id : null,
        accounts: { create: { id: newId(), accountId: id, providerId: "credential", password: passwordHash } },
      },
    });
    accounts.push({ name, email, role, school: schoolCode ? SCHOOLS.find((s) => s.code === schoolCode)!.name : "alle scholen" });
    return id;
  }
  await user("Bestuurder SHON (demo)", `bestuur@${MAIL}`, "BOARD", null);
  await user("Kwaliteitsmedewerker SHON (demo)", `kwaliteit@${MAIL}`, "QUALITY_STAFF", null);
  await user("Directeur Shri Vishnu (demo)", `directeur.svs@${MAIL}`, "SCHOOL_ADMIN", "SVS");
  const ibId = await user("IB Shri Vishnu (demo)", `ib.svs@${MAIL}`, "IB", "SVS");
  const teacherIds: Record<string, string> = {};
  for (const t of TEACHERS) {
    const schoolCode = t.key.split("/")[0];
    const id = await user(t.name, t.email, "TEACHER", schoolCode);
    teacherIds[t.key] = id;
    await prisma.classGroupMembership.create({ data: { userId: id, classGroupId: groupIds[t.key].id } });
  }

  // Weekplannen met rooster-snapshot en lessen, voor de groepen met een leerkracht
  const days = await prisma.schoolDaySchedule.findMany({ where: { school: { organizationId: org.id } } });
  const items = await prisma.scheduleItem.findMany({ where: { school: { organizationId: org.id } } });
  const planIds: Record<string, string> = {}; // key/weekOffset
  const PLAN_WEEKS = [-7, -6, -4, -3, -2, -1, 0];
  for (const t of TEACHERS) {
    const grp = groupIds[t.key];
    for (const offset of PLAN_WEEKS) {
      const wi = ((offset % 4) + 4) % 4;
      const content = lessonsFor(grp.grades, wi);
      const lessons: { dag: string; timeSlot: string; type: string; subject: string; goalBasis?: string; goalVerlengd?: string; goalVerrijking?: string }[] = [];
      WEEKDAYS.forEach((weekday, di) => {
        const day = days.find((d) => d.schoolId === grp.schoolId && d.dayOfWeek === weekday);
        if (!day) return;
        const fixed = resolveDayForGroup(items.filter((i) => i.schoolId === grp.schoolId), day, grp.grades).slots;
        for (const s of fixed) lessons.push({ dag: weekday, timeSlot: `${s.start}-${s.end}`, type: s.item.category, subject: s.item.label });
        const blocks = freeBlocks(day.startTime, day.endTime, fixed.map((s) => ({ start: s.start, end: s.end })), 10);
        let bi = 0;
        let cursor = blocks[0] ? toMinutes(blocks[0].start) : 0;
        for (const l of content[di]) {
          while (bi < blocks.length && toMinutes(blocks[bi].end) - cursor < l.minutes) {
            bi++;
            if (bi < blocks.length) cursor = toMinutes(blocks[bi].start);
          }
          if (bi >= blocks.length) break;
          lessons.push({
            dag: weekday, timeSlot: `${fromMinutes(cursor)}-${fromMinutes(cursor + l.minutes)}`, type: "les", subject: l.subject,
            goalBasis: l.basis, goalVerlengd: l.verlengd, goalVerrijking: l.verrijking,
          });
          cursor += l.minutes;
        }
      });
      const status = offset < -1 ? "APPROVED" : offset === -1 ? "SUBMITTED" : "DRAFT";
      const plan = await prisma.weekPlan.create({
        data: {
          organizationId: org.id, schoolId: grp.schoolId, classGroupId: grp.id, userId: teacherIds[t.key],
          periode: weekKey(offset), status,
          thema: ["Herfst", "Licht en donker", "Duurzaamheid", "Wie ben ik?"][((offset % 4) + 4) % 4],
          lessons: { create: lessons },
        },
      });
      planIds[`${t.key}@${offset}`] = plan.id;
    }
  }

  // Groepsreflecties
  const reflIds: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(REFLECTIONS)) {
    const grp = groupIds[key];
    for (const r of list) {
      const weekPlanId = planIds[`${key}@${r.weekOffset}`];
      if (!weekPlanId) continue;
      const refl = await prisma.groupReflection.create({
        data: {
          organizationId: org.id, schoolId: grp.schoolId, classGroupId: grp.id, weekPlanId, userId: teacherIds[key],
          subject: r.subject, basis: r.basis, verlengd: r.verlengd, verrijking: r.verrijking,
          goed: r.goed, aandacht: r.aandacht, vervolg: r.vervolg,
        },
      });
      (reflIds[`${key}|${r.subject}`] ??= []).push(refl.id);
    }
  }

  // Clusterplannen: concept uit de reflecties (zelfde opbouw als in de app), met bron
  async function cluster(key: string, subject: string, goalCode: string | null, start: number, evalOffset: number,
    status: "DRAFT" | "VASTGESTELD" | "GEEVALUEERD", fixedBy: string | null, evaluatie?: string, effect?: "JA" | "DEELS" | "NEE") {
    const grp = groupIds[key];
    const sourceIds = reflIds[`${key}|${subject}`] ?? [];
    const refl = await prisma.groupReflection.findMany({
      where: { id: { in: sourceIds } }, include: { weekPlan: { select: { periode: true } } }, orderBy: { weekPlan: { periode: "desc" } },
    });
    const goal = goalCode ? GOALS.find((g) => g.code === goalCode) : null;
    const content = draftClusterPlan(subject, refl.map((r) => ({
      periode: r.weekPlan.periode, basis: parseLevel(r.basis), verlengd: parseLevel(r.verlengd), verrijking: parseLevel(r.verrijking),
      aandacht: r.aandacht, vervolg: r.vervolg,
    })), goal?.title);
    await prisma.clusterPlan.create({
      data: {
        organizationId: org.id, schoolId: grp.schoolId, classGroupId: grp.id, createdById: teacherIds[key],
        subject, startPeriode: weekKey(start), evaluatiePeriode: weekKey(evalOffset), status,
        qualityGoalId: goalCode ? goals[goalCode] : null, ...content,
        vastgesteldById: status === "DRAFT" ? null : fixedBy, vastgesteldAt: status === "DRAFT" ? null : new Date(Date.now() + start * 7 * DAY_MS),
        evaluatie: evaluatie ?? null, effect: effect ?? null,
        geevalueerdAt: status === "GEEVALUEERD" ? new Date(Date.now() + evalOffset * 7 * DAY_MS) : null,
        sources: { create: sourceIds.map((reflectionId) => ({ reflectionId })) },
      },
    });
  }
  await cluster("SVS/5a", "Rekenen", "REK-1F", -1, 4, "VASTGESTELD", ibId);
  await cluster("SVS/7a", "Begrijpend lezen", "TAAL-2F", -6, -1, "GEEVALUEERD", ibId,
    "Methodetoets en observaties: de meeste leerlingen formuleren de hoofdgedachte nu in eigen woorden; bij langere teksten zakt het intensieve cluster nog terug.", "DEELS");
  await cluster("SVS/1", "Rekenkring", "REK-1F", 0, 4, "DRAFT", null);
  await cluster("SKS/5/6", "Rekenen", "REK-1F", -2, -1, "VASTGESTELD", null); // evaluatie staat open (week voorbij)
  await cluster("SLS/6a", "Rekenen", "REK-1F", -3, 3, "VASTGESTELD", null);
  await cluster("SSS/7", "Begrijpend lezen", "TAAL-2F", -4, -1, "GEEVALUEERD", null,
    "Samenvatten met drie kernzinnen werkt: bij de laatste methodetoets haalde het intensieve cluster het doel.", "JA");

  // Accountoverzicht voor de presentator (niet in git)
  const lines = [
    "Klasmaatje DEMO-accounts SHON (demo, fictieve gegevens). Dit bestand staat niet in git.",
    `Demo-adres: http://localhost:3001  ·  Wachtwoord voor alle accounts: ${password}`,
    "",
    ...accounts.map((a) => `${a.role.padEnd(14)} ${a.email.padEnd(44)} ${a.name} (${a.school})`),
  ];
  writeFileSync(".demo-accounts.txt", lines.join("\n") + "\n");
  console.log(`Klaar: ${SCHOOLS.length} scholen, ${Object.keys(groupIds).length} groepen, ${accounts.length} accounts, ${Object.keys(planIds).length} weekplannen.`);
  console.log("Accounts en wachtwoord staan in .demo-accounts.txt (niet in git).");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
