// Toegang tot de DEMO resetten zonder de demodata te wissen (lespakketten,
// clusterplannen en testresultaten blijven staan).
//
// Vooraf: sluit de demo-testtoegang (Vercel-deellink en/of bypass intrekken).
// Bevestig dat met --toegang-dicht.
//
//   node scripts/demo.mjs tsx prisma/scripts/demo-reset-access.ts --toegang-dicht
//       -> nieuw wachtwoord voor alle demo-accounts (uit DEMO_PASSWORD) en alle
//          sessies van demo-accounts ingetrokken (iedereen is uitgelogd)
//   node scripts/demo.mjs tsx prisma/scripts/demo-reset-access.ts --toegang-dicht --alleen-sessies
//       -> alleen alle sessies intrekken
//   --wachttijd=30   (seconden vóór de tweede intrekronde; standaard 20)
//
// Draait alleen via scripts/demo.mjs (.env.demo, DEMO_MODE=1, DEMO_DB_REF).
// De volgorde (hash vooraf, transactie, tweede ronde) staat uitgelegd in demo-access-core.ts.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "../../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { demoDatabaseProblem } from "../../lib/demo-guard.mjs";
import { resetDemoAccess } from "./demo-access-core";

async function main() {
  if (process.env.DEMO_MODE !== "1") throw new Error("Geweigerd: alleen voor de demo (DEMO_MODE=1).");
  const problem = demoDatabaseProblem(process.env);
  if (problem) throw new Error(problem);

  const args = process.argv.slice(2);
  if (!args.includes("--toegang-dicht")) {
    throw new Error(
      "Sluit eerst de demo-testtoegang (Vercel-deellink en bypass intrekken) en draai daarna opnieuw met --toegang-dicht."
    );
  }
  const onlySessions = args.includes("--alleen-sessies");
  const waitArg = args.find((a) => a.startsWith("--wachttijd="));
  const waitSec = waitArg ? Number(waitArg.split("=")[1]) : 20;
  if (!Number.isFinite(waitSec) || waitSec < 5) throw new Error("--wachttijd moet minstens 5 seconden zijn.");

  const password = process.env.DEMO_PASSWORD ?? "";
  if (!onlySessions && password.length < 10) {
    throw new Error("Zet een nieuw wachtwoord van minstens 10 tekens in DEMO_PASSWORD (in .env.demo of in de terminal).");
  }

  // Stap 1: hash vooraf berekenen, vóór er iets in de database verandert.
  const passwordHash = onlySessions ? null : await hashPassword(password);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await resetDemoAccess(prisma, { passwordHash, waitMs: waitSec * 1000, log: console.log });
    if (!onlySessions) {
      const file = ".demo-accounts.txt";
      if (existsSync(file)) {
        writeFileSync(file, readFileSync(file, "utf8").replace(/(Wachtwoord voor alle accounts: ).*/, `$1${password}`));
        console.log(`${file} bijgewerkt.`);
      }
    }
    console.log("Klaar. Iedereen is uitgelogd; alleen het nieuwe wachtwoord werkt. Zet daarna een NIEUWE deellink aan.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
