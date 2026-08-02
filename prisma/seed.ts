import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { GLOBAL_METHODS } from "./data/methods";

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
  // Ganesha/Krishna/Saraswatie; 2025-26 voor Vishnu/Laksmi). Directies kunnen
  // dit later zelf bijwerken via het instellingenscherm.
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

    for (const d of s.days) {
      await prisma.schoolDaySchedule.upsert({
        where: {
          schoolId_dayOfWeek: { schoolId: school.id, dayOfWeek: d.dayOfWeek },
        },
        update: {
          startTime: d.startTime,
          endTime: d.endTime,
          breakStart: d.breakStart,
          breakEnd: d.breakEnd,
        },
        create: {
          schoolId: school.id,
          dayOfWeek: d.dayOfWeek,
          startTime: d.startTime,
          endTime: d.endTime,
          breakStart: d.breakStart,
          breakEnd: d.breakEnd,
        },
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

  const dayCount = await prisma.schoolDaySchedule.count();
  console.log("Seed klaar:");
  console.log("  Organisatie:", shon.name);
  console.log("  Scholen:", schools.map((s) => s.code).join(", "));
  console.log("  Dagroosters:", dayCount);
  console.log("  Methode-catalogus:", methods.length);
  console.log("  SHON-standaardmethodes per school:", shonDefaults.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
