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

  console.log("Seed klaar:", shon);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });