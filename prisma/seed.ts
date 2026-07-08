import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
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

  const methods = await Promise.all([
    prisma.method.upsert({
      where: { name: "Faqta" },
      update: {},
      create: {
        name: "Faqta",
        subject: "wereldoriëntatie",
        description: "Methode voor wereldoriëntatie en burgerschap, gericht op onderzoekend leren.",
      },
    }),
    prisma.method.upsert({
      where: { name: "Estafette" },
      update: {},
      create: {
        name: "Estafette",
        subject: "technisch lezen",
        description: "Voortgezet technisch leesonderwijs voor groep 4 t/m 8.",
      },
    }),
    prisma.method.upsert({
      where: { name: "Schatkist" },
      update: {},
      create: {
        name: "Schatkist",
        subject: "kleuters",
        description: "Totaalmethode voor groep 1-2, gericht op spelend leren.",
      },
    }),
  ]);

  for (const method of methods) {
    await prisma.organizationMethod.upsert({
      where: { organizationId_methodId: { organizationId: shon.id, methodId: method.id } },
      update: {},
      create: { organizationId: shon.id, methodId: method.id },
    });
  }

  console.log("Seed klaar:", shon);
  console.log("Methodes gekoppeld aan SHON:", methods.map((m) => m.name).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });