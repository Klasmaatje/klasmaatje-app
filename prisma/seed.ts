import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { GLOBAL_METHODS } from "./data/methods";
import { SCHEDULE_ITEM_TEMPLATES } from "./data/schedule-items";
import { isValidDefaultTime } from "../lib/schedule-items";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Bestuur / stichting
  const shon = await prisma.organization.upsert({
    where: { slug: "shon" },
    update: {},
    create: {
      name: "Stichting Hindoe Onderwijs Nederland",
      slug: "shon",
      primaryColor: "#3D2467",
      accentColor: "#E8B44A",
      config: {
        create: {
          aiProvider: "gemini",
          microAnalyseLabel: "Micro-analyse",
          qualityFramework: "SLO-kerndoelen",
        },
      },
    },
  });

  // ----- De vijf SHON-scholen, met hun dagroosters -----
  // De ECHTE tijden staan als dagroosters (SchoolDaySchedule); rosterType is
  // slechts een label/onboarding-sjabloon. SHON heeft scholen in meerdere
  // steden met verschillende roosters. Bron: schoolgidsen (2022-23 voor
  // Ganesha/Krishna/Saraswatie; 2025-26 voor Vishnu/Laksmi). Directies werken
  // dit zelf bij via /schoolrooster; de seed vult alleen een lege school.
  type DaySpec = {
    startTime: string;
    endTime: string;
    breakStart: string | null;
    breakEnd: string | null;
  };
  type Weekday = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY";
  type DayRow = DaySpec & { dayOfWeek: Weekday };

  // Helper: normale dagen (ma/di/do/vr) gelijk, woensdag apart.
  const week = (normal: DaySpec, wednesday: DaySpec): DayRow[] => [
    { dayOfWeek: "MONDAY", ...normal },
    { dayOfWeek: "TUESDAY", ...normal },
    { dayOfWeek: "WEDNESDAY", ...wednesday },
    { dayOfWeek: "THURSDAY", ...normal },
    { dayOfWeek: "FRIDAY", ...normal },
  ];

  const laksmiDay: DaySpec = {
    startTime: "08:30",
    endTime: "14:15",
    breakStart: null,
    breakEnd: null,
  };

  const schoolData: {
    code: string;
    name: string;
    rosterType: "TRADITIONAL" | "CONTINUOUS" | "CUSTOM";
    days: DayRow[];
  }[] = [
    {
      code: "SGS",
      name: "Shri Ganesha School",
      rosterType: "TRADITIONAL",
      days: week(
        { startTime: "08:45", endTime: "15:00", breakStart: "12:30", breakEnd: "13:00" },
        { startTime: "08:45", endTime: "12:45", breakStart: null, breakEnd: null }
      ),
    },
    {
      code: "SSS",
      name: "Shri Saraswatie School",
      rosterType: "TRADITIONAL",
      days: week(
        { startTime: "08:45", endTime: "14:30", breakStart: "12:00", breakEnd: "12:45" },
        { startTime: "08:45", endTime: "13:00", breakStart: null, breakEnd: null }
      ),
    },
    {
      code: "SKS",
      name: "Shri Krishna School",
      rosterType: "CONTINUOUS", // continurooster (overblijven), maar wo nog half
      days: week(
        { startTime: "08:45", endTime: "15:00", breakStart: null, breakEnd: null },
        { startTime: "08:45", endTime: "12:30", breakStart: null, breakEnd: null }
      ),
    },
    {
      code: "SVS",
      name: "Shri Vishnu School",
      rosterType: "TRADITIONAL",
      days: week(
        { startTime: "08:40", endTime: "15:00", breakStart: "12:30", breakEnd: "13:00" },
        { startTime: "08:40", endTime: "12:30", breakStart: null, breakEnd: null }
      ),
    },
    {
      code: "SLS",
      name: "Shri Laksmi School",
      rosterType: "CONTINUOUS", // 5 gelijke dagen (Amsterdam)
      days: week(laksmiDay, laksmiDay),
    },
  ];

  const schools = [];
  for (const s of schoolData) {
    const school = await prisma.school.upsert({
      where: { code: s.code },
      update: { rosterType: s.rosterType },
      create: {
        code: s.code,
        name: s.name,
        organizationId: shon.id,
        rosterType: s.rosterType,
      },
    });
    schools.push(school);

    // Alleen voor een school zonder schooltijden: daarna beheert de directie
    // ze zelf via /schoolrooster en mag de seed niets overschrijven (ook geen
    // dag terugzetten die de school bewust leeg heeft gelaten).
    const hasDays = (await prisma.schoolDaySchedule.count({ where: { schoolId: school.id } })) > 0;
    if (!hasDays) {
      await prisma.schoolDaySchedule.createMany({
        data: s.days.map((d) => ({ schoolId: school.id, ...d })),
      });
    }
  }

  // ----- Landelijke methode-catalogus -----
  // Method = globale catalogus; scholen kiezen hieruit via SchoolMethod.
  // Bron: GLOBAL_METHODS in prisma/data/methods.ts (top-20 NL-methodes).
  const methods = [];
  for (const m of GLOBAL_METHODS) {
    const method = await prisma.method.upsert({
      where: { name: m.name },
      update: {
        subject: m.subject,
        subjectArea: m.subject,
        publisher: m.publisher,
        description: m.description,
      },
      create: {
        name: m.name,
        subject: m.subject,
        subjectArea: m.subject,
        publisher: m.publisher,
        description: m.description,
      },
    });
    methods.push(method);
  }

  // SHON's standaardmethodes: als startpunt op elke SHON-school gekoppeld.
  // Elke school past z'n eigen set later zelf aan (per school via SchoolMethod).
  const shonDefaultMethodNames = [
    "Wereld in Getallen (WIG 4/5)",
    "Veilig Leren Lezen (Kim-versie)",
    "Estafette (Editie 3.0)",
    "Faqta",
    "Schatkist (Editie 3)",
  ];
  const shonDefaults = methods.filter((m) => shonDefaultMethodNames.includes(m.name));

  for (const school of schools) {
    for (const method of shonDefaults) {
      await prisma.schoolMethod.upsert({
        where: {
          schoolId_methodId: { schoolId: school.id, methodId: method.id },
        },
        update: {},
        create: { schoolId: school.id, methodId: method.id },
      });
    }
  }

  // ----- Groepen schooljaar 2026/2027 -----
  // Bron: werkverdelings-/formatieplannen 2026-2027 per school (formatietabel).
  // Naam = zoals de school de groep noemt; grades = leerjaren 1-8.
  // Bewust GEEN leerkrachtnamen: wie in welke groep werkt, loopt via
  // ClassGroupMembership zodra mensen een account hebben.
  // SLS (Laksmi): formatie 2026-2027 ontvangen van de directie (20 okt 2026).
  const SCHOOL_YEAR = "2026/2027";
  const groupsBySchool: Record<string, { name: string; grades: number[] }[]> = {
    // SGS: "0/1/2" = kleutergroep incl. instromers; leerjaar 0 bestaat niet als jaarlaag.
    SGS: [
      { name: "0/1/2", grades: [1, 2] },
      { name: "3", grades: [3] },
      { name: "4/5", grades: [4, 5] },
      { name: "6/7", grades: [6, 7] },
      { name: "8", grades: [8] },
    ],
    SSS: [
      { name: "1/2a", grades: [1, 2] },
      { name: "1/2b", grades: [1, 2] },
      { name: "3", grades: [3] },
      { name: "4/5", grades: [4, 5] },
      { name: "6", grades: [6] },
      { name: "7", grades: [7] },
      { name: "8", grades: [8] },
    ],
    SKS: [
      { name: "1/2", grades: [1, 2] },
      { name: "3/4", grades: [3, 4] },
      { name: "5/6", grades: [5, 6] },
      { name: "7/8", grades: [7, 8] },
    ],
    // SVS: kleuters per jaarlaag (groep 1 apart, groep 2 in twee groepen).
    // 7b nog te bevestigen: formatietabel is daar onduidelijk ("7ba").
    SVS: [
      { name: "1", grades: [1] },
      { name: "2a", grades: [2] },
      { name: "2b", grades: [2] },
      { name: "3a", grades: [3] },
      { name: "3b", grades: [3] },
      { name: "4a", grades: [4] },
      { name: "4b", grades: [4] },
      { name: "5a", grades: [5] },
      { name: "5b", grades: [5] },
      { name: "6a", grades: [6] },
      { name: "6b", grades: [6] },
      { name: "7a", grades: [7] },
      { name: "7b", grades: [7] },
      { name: "8a", grades: [8] },
      { name: "8b", grades: [8] },
    ],
    // SLS: formatie 2026-2027 (directie, 20 okt 2026).
    SLS: [
      { name: "1", grades: [1] },
      { name: "2", grades: [2] },
      { name: "3", grades: [3] },
      { name: "4", grades: [4] },
      { name: "5", grades: [5] },
      { name: "6a", grades: [6] },
      { name: "6b", grades: [6] },
      { name: "7", grades: [7] },
      { name: "8a", grades: [8] },
      { name: "8b", grades: [8] },
    ],
  };

  for (const school of schools) {
    for (const g of groupsBySchool[school.code] ?? []) {
      await prisma.classGroup.upsert({
        where: {
          schoolId_schoolYear_name: {
            schoolId: school.id,
            schoolYear: SCHOOL_YEAR,
            name: g.name,
          },
        },
        update: { grades: g.grades },
        create: {
          organizationId: school.organizationId,
          schoolId: school.id,
          name: g.name,
          grades: g.grades,
          schoolYear: SCHOOL_YEAR,
        },
      });
    }
  }

  // ----- Vaste dagonderdelen (ScheduleItem) -----
  // Startsjabloon voor een school die nog GEEN vaste dagonderdelen heeft.
  // Daarna beheert de directie ze zelf via /schoolrooster: de seed werkt
  // bestaande items niet meer bij en zet verwijderde items niet terug.
  for (const t of SCHEDULE_ITEM_TEMPLATES) {
    if (!isValidDefaultTime(t.defaultTime)) {
      throw new Error(`Ongeldige defaultTime voor "${t.label}": ${t.defaultTime}`);
    }
  }
  for (const school of schools) {
    const hasItems = (await prisma.scheduleItem.count({ where: { schoolId: school.id } })) > 0;
    if (hasItems) continue;
    await prisma.scheduleItem.createMany({
      data: SCHEDULE_ITEM_TEMPLATES.map((t) => ({
        schoolId: school.id,
        label: t.label,
        defaultTime: t.defaultTime,
        category: t.category,
        targetGrades: t.targetGrades,
        sortOrder: t.sortOrder,
        aiHint: t.aiHint,
      })),
    });
  }

  // Kwaliteitsdoelen SHON, normen letterlijk uit het SBP 2025-2029 (gecontroleerd 26 okt 2026). Alleen aanmaken
  // als ze nog niet bestaan: het bestuur kan ze daarna zelf bijwerken.
  const qualityGoals = [
    {
      code: "REK-1F",
      title: "Rekenen: 1F eind groep 6, 75% 1S bij uitstroom",
      source: "Strategisch Beleidsplan SHON 2025-2029, Ambitie Rekenen (p. 17)",
      norm: "Wij vinden dat elke leerling eind groep 6 het niveau van 1F behaald moet hebben (uitzonderingen van zorgleerlingen daargelaten). Eind groep 8, is het onze ambitie, dat 75% van onze leerlingen uitstromen op 1S niveau.",
      subject: "Rekenen",
      validFromYear: 2025,
      validToYear: 2029,
    },
    {
      code: "TAAL-2F",
      title: "Taal en begrijpend lezen: 1F eind groep 6, 85% 2F bij uitstroom",
      source: "Strategisch Beleidsplan SHON 2025-2029, Ambitie Taal (p. 19)",
      norm: "Wij vinden dat elke leerling eind groep 6 het niveau van 1F behaald moet hebben (uitzonderingen van zorgleerlingen daargelaten). Eind groep 8, is het onze ambitie, dat 85% van onze leerlingen uitstromen op 2F niveau.",
      subject: "Begrijpend lezen",
      validFromYear: 2025,
      validToYear: 2029,
    },
    {
      code: "EDI-CVB",
      title: "EDI: controle van begrip, verlengde en verdiepende instructie",
      source: "Strategisch Beleidsplan SHON 2025-2029, Ambitie EDI (p. 21)",
      norm: "Leraren controleren begrip: wisbordjes, willekeurige beurten. Er wordt een verdiepende en verlengde instructie gerealiseerd om tegemoet te komen aan sterke en zwakke leerlingen.",
      subject: null,
      validFromYear: 2025,
      validToYear: 2029,
    },
  ];
  for (const goal of qualityGoals) {
    await prisma.qualityGoal.upsert({
      where: { organizationId_code: { organizationId: shon.id, code: goal.code } },
      update: {},
      create: { organizationId: shon.id, ...goal },
    });
  }

  const dayCount = await prisma.schoolDaySchedule.count();
  console.log("Seed klaar:");
  console.log("  Organisatie:", shon.name);
  console.log("  Scholen:", schools.map((s) => s.code).join(", "));
  console.log("  Dagroosters:", dayCount);
  console.log("  Methode-catalogus:", methods.length);
  console.log("  Kwaliteitsdoelen:", await prisma.qualityGoal.count({ where: { organizationId: shon.id } }));
  console.log("  SHON-standaardmethodes per school:", shonDefaults.length);
  for (const school of schools) {
    const count = await prisma.classGroup.count({
      where: { schoolId: school.id, schoolYear: SCHOOL_YEAR },
    });
    console.log(`  Groepen ${SCHOOL_YEAR} ${school.code}:`, count);
  }
  for (const school of schools) {
    const count = await prisma.scheduleItem.count({ where: { schoolId: school.id } });
    console.log(`  Vaste dagonderdelen ${school.code}:`, count);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
