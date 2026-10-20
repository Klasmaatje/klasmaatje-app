// Controle vaste dagonderdelen (ScheduleItem) per school.
//
// Draaien:  npx tsx prisma/scripts/check-schedule.ts
//
// Alleen lezen: toont per school voor een kleutergroep en een groep 3-8 hoe
// maandag en woensdag eruitzien, met tijden afgeleid uit het dagrooster
// (SchoolDaySchedule). Controleert daarnaast een paar harde regels. Schrijft
// niets naar de database.

import "dotenv/config";
import { PrismaClient } from "../../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isValidDefaultTime, resolveDayForGroup } from "../../lib/schedule-items";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SCHOOL_YEAR = "2026/2027";
const DAYS = ["MONDAY", "WEDNESDAY"] as const;
const DAY_NL: Record<string, string> = { MONDAY: "maandag", WEDNESDAY: "woensdag" };

let failed = 0;
function check(ok: boolean, message: string) {
  if (!ok) {
    failed++;
    console.log(`  FOUT  ${message}`);
  }
}

async function main() {
  const schools = await prisma.school.findMany({
    orderBy: { code: "asc" },
    include: {
      daySchedules: true,
      scheduleItems: true,
      classGroups: { where: { schoolYear: SCHOOL_YEAR }, orderBy: { name: "asc" } },
    },
  });

  for (const school of schools) {
    console.log(`\n${school.code} (${school.rosterType}), ${school.scheduleItems.length} vaste dagonderdelen`);
    check(school.scheduleItems.length > 0, `${school.code}: geen vaste dagonderdelen (seed gedraaid?)`);
    for (const item of school.scheduleItems) {
      check(isValidDefaultTime(item.defaultTime), `${school.code}: ongeldige tijd bij "${item.label}"`);
    }

    // Voorbeeldgroepen; scholen zonder groepen (SLS) krijgen een fictieve groep.
    const kleuter = school.classGroups.find((g) => g.grades.some((x) => x <= 2));
    const midden = school.classGroups.find((g) => g.grades.every((x) => x >= 3));
    const samples = [
      { name: kleuter?.name ?? "(voorbeeld 1/2)", grades: kleuter?.grades ?? [1, 2] },
      { name: midden?.name ?? "(voorbeeld 5)", grades: midden?.grades ?? [5] },
    ];

    for (const dayName of DAYS) {
      const day = school.daySchedules.find((d) => d.dayOfWeek === dayName);
      if (!day) continue;
      for (const g of samples) {
        const { slots, weekly } = resolveDayForGroup(school.scheduleItems, day, g.grades);
        const line = slots.map((s) => `${s.start}-${s.end} ${s.item.label}`).join(" | ");
        console.log(`  ${DAY_NL[dayName]} groep ${g.name} (${day.startTime}-${day.endTime}): ${line}`);

        const labels = slots.map((s) => s.item.label);
        check(slots[0]?.item.label === "Dagopening en gebed", `${school.code} ${dayName} ${g.name}: dag begint niet met het gebed`);
        check(slots.every((s) => s.start >= day.startTime && s.end <= day.endTime), `${school.code} ${dayName} ${g.name}: moment buiten de schooldag`);
        const isKleuter = g.grades.some((x) => x <= 2);
        check(labels.includes(isKleuter ? "Dagstart in de kring" : "Leesmoment"), `${school.code} ${dayName} ${g.name}: verkeerde dagstart voor dit leerjaar`);
        const hasLunch = labels.includes("Middagpauze (eten en buitenspelen)");
        const longDay = day.endTime >= "14:00";
        check(hasLunch === longDay, `${school.code} ${dayName} ${g.name}: middagpauze hoort ${longDay ? "wel" : "niet"} op deze dag`);
        if (dayName === "MONDAY") {
          check(weekly.length === 2, `${school.code} ${g.name}: verwacht 2 vaste weeklessen (gym, dharma/hindi)`);
        }
      }
    }
  }

  console.log(failed === 0 ? "\nAlle controles geslaagd. Database ongewijzigd (alleen gelezen)." : `\n${failed} controle(s) mislukt.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
