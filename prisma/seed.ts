import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

  // De vijf SHON-scholen
  const schoolData = [
    { code: "SGS", name: "Shri Ganesha School" },
    { code: "SSS", name: "Shri Saraswatie School" },
    { code: "SKS", name: "Shri Krishna School" },
    { code: "SVS", name: "Shri Vishnu School" },
    { code: "SLS", name: "Shri Laksmi School" },
  ];

  const schools = [];
  for (const s of schoolData) {
    const school = await prisma.school.upsert({
      where: { code: s.code },
      update: {},
      create: { code: s.code, name: s.name, organizationId: shon.id },
    });
    schools.push(school);
  }

  // Methodes (globale catalogus) met SLO-koppeling
  const methodData = [
    {
      name: "Faqta",
      subject: "wereldoriëntatie",
      description: "Wereldoriëntatie en burgerschap, onderzoekend leren.",
      subjectArea: "Wereldoriëntatie & Burgerschap",
      sloMapping: ["Kerndoel 37", "Kerndoel 38", "Kerndoel 51"],
    },
    {
      name: "Estafette",
      subject: "technisch lezen",
      description: "Voortgezet technisch leesonderwijs groep 4 t/m 8.",
      subjectArea: "Technisch Lezen",
      sloMapping: ["Kerndoel 4", "Kerndoel 2"],
    },
    {
      name: "Schatkist",
      subject: "kleuters",
      description: "Totaalmethode groep 1-2, spelend leren.",
      subjectArea: "Het Jonge Kind",
      sloMapping: ["Kerndoel 1", "Kerndoel 2", "Kerndoel 23"],
    },
  ];

  const methods = [];
  for (const m of methodData) {
    const method = await prisma.method.upsert({
      where: { name: m.name },
      update: {},
      create: m,
    });
    methods.push(method);
  }

  // Voor nu: alle scholen krijgen alle methodes gekoppeld (per school aanpasbaar later)
  for (const school of schools) {
    for (const method of methods) {
      await prisma.schoolMethod.upsert({
        where: { schoolId_methodId: { schoolId: school.id, methodId: method.id } },
        update: {},
        create: { schoolId: school.id, methodId: method.id },
      });
    }
  }

  console.log("Seed klaar:");
  console.log("  Organisatie:", shon.name);
  console.log("  Scholen:", schools.map((s) => s.code).join(", "));
  console.log("  Methodes:", methods.map((m) => m.name).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });