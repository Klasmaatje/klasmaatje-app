// Controle beheerscherm schoolrooster (lib/schedule-admin.ts). Geen database.
//
// Draaien:  npx tsx prisma/scripts/check-schedule-admin.ts
//
// - Elk anker uit het startsjabloon gaat heen en terug door het formulier
//   zonder te veranderen (anders zou "Opslaan" zonder wijziging het rooster
//   ongemerkt aanpassen).
// - Controles op schooltijden en dagonderdelen geven de juiste foutmelding.
// - De teksten van het startsjabloon komen door de privacycontrole (anders kan
//   de directie een bestaand item niet opslaan).

import {
  cleanGrades,
  composeMoment,
  describeGrades,
  describeMoment,
  parseMoment,
  previewMoment,
  validateDay,
} from "../../lib/schedule-admin";
import { SCHEDULE_ITEM_TEMPLATES } from "../data/schedule-items";
import { buildAllowList, scanFields } from "../../lib/privacy";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
  } else {
    failures.push(label);
    console.log(`  FOUT  ${label} ${detail}`);
  }
}

console.log("1. Ankers heen en terug");
const anchors = [...new Set([...SCHEDULE_ITEM_TEMPLATES.map((t) => t.defaultTime), "start+10/20", "end-30/15", "08:30/10"])];
for (const a of anchors) {
  const back = composeMoment(parseMoment(a));
  check(`anker ${a}`, back.ok && back.defaultTime === a, JSON.stringify(back));
}

console.log("2. Dagonderdelen samenstellen");
const err = (r: ReturnType<typeof composeMoment>) => (r.ok ? "" : r.error);
check("start zonder verschuiving", (composeMoment({ kind: "start", offset: 0, clock: "", duration: 5 }) as { defaultTime: string }).defaultTime === "start/5");
check("einde: laatste kwartier", (composeMoment({ kind: "end", offset: 15, clock: "", duration: 15 }) as { defaultTime: string }).defaultTime === "end-15/15");
check("einde dat doorloopt na schooltijd wordt geweigerd", err(composeMoment({ kind: "end", offset: 10, clock: "", duration: 15 })).includes("na het einde"));
check("duur 0 wordt geweigerd", err(composeMoment({ kind: "start", offset: 0, clock: "", duration: 0 })).includes("duur"));
check("duur 300 wordt geweigerd", err(composeMoment({ kind: "clock", offset: 0, clock: "10:00", duration: 300 })).includes("duur"));
check("ongeldige kloktijd wordt geweigerd", err(composeMoment({ kind: "clock", offset: 0, clock: "25:00", duration: 15 })).includes("kloktijd"));
check("kloktijd 9:5 wordt geweigerd", err(composeMoment({ kind: "clock", offset: 0, clock: "9:5", duration: 15 })).includes("kloktijd"));
check("kloktijd 9:15 wordt 09:15", (composeMoment({ kind: "clock", offset: 0, clock: "9:15", duration: 15 }) as { defaultTime: string }).defaultTime === "09:15/15");
check("negatieve minuten worden geweigerd", !composeMoment({ kind: "start", offset: -5, clock: "", duration: 15 }).ok);
check("halve minuten worden geweigerd", !composeMoment({ kind: "start", offset: 2.5, clock: "", duration: 15 }).ok);
check("weekles = geen tijd", (composeMoment({ kind: "weekly", offset: 0, clock: "", duration: 0 }) as { defaultTime: null }).defaultTime === null);

console.log("3. Omschrijvingen");
check("omschrijving start/5", describeMoment("start/5") === "Bij de start van de dag, 5 min");
check("omschrijving start+5/30", describeMoment("start+5/30") === "5 min na de start, 30 min");
check("omschrijving end-15/15", describeMoment("end-15/15") === "Laatste 15 min van de dag");
check("omschrijving midday", describeMoment("midday") === "Middagpauze uit de schooltijden");
check("omschrijving weekles", describeMoment(null) === "Geen vaste tijd (weekles)");
check("groepen leeg", describeGrades([]) === "Alle groepen");
check("groepen 1-2", describeGrades([2, 1]) === "Groep 1 en 2");
check("groepen 3-8", describeGrades([3, 4, 5, 6, 7, 8]) === "Groep 3 t/m 8");
check("groepen 1,4,6", describeGrades([1, 4, 6]) === "Groep 1, 4 en 6");
check("alle 8 aangevinkt = leeg", cleanGrades(["1", "2", "3", "4", "5", "6", "7", "8"]).length === 0);
check("rommel uit formulier eruit", cleanGrades(["3", "x", "9", "0", "3", "1"]).join() === "1,3");

console.log("4. Schooltijden");
const day = (o: Partial<Parameters<typeof validateDay>[0]>) =>
  validateDay({ open: true, startTime: "08:30", endTime: "15:00", breakStart: "", breakEnd: "", ...o }, "Maandag");
const dayErr = (r: ReturnType<typeof validateDay>) => (r.ok ? "" : r.error);
check("gewone dag zonder pauze", day({}).ok);
check("dag dicht = geen rij", (() => { const r = validateDay({ open: false, startTime: "", endTime: "", breakStart: "", breakEnd: "" }, "Woensdag"); return r.ok && r.day === null; })());
check("8:30 wordt 08:30", (() => { const r = day({ startTime: "8:30" }); return r.ok && r.day?.startTime === "08:30"; })());
check("einde voor begin geweigerd", dayErr(day({ endTime: "08:00" })).includes("eindtijd"));
check("alleen pauze-begin geweigerd", dayErr(day({ breakStart: "12:00" })).includes("zowel"));
check("pauze buiten de dag geweigerd", dayErr(day({ breakStart: "15:00", breakEnd: "15:30" })).includes("binnen"));
check("pauze omgedraaid geweigerd", dayErr(day({ breakStart: "12:30", breakEnd: "12:00" })).includes("eindigen"));
check("lege begintijd geweigerd", dayErr(day({ startTime: "" })).includes("begin- en eindtijd"));
check("pauze 12:30-13:00 ok", (() => { const r = day({ breakStart: "12:30", breakEnd: "13:00" }); return r.ok && r.day?.breakEnd === "13:00"; })());

console.log("5. Voorvertoning");
const svs = [
  { dayOfWeek: "MONDAY", startTime: "08:40", endTime: "15:00", breakStart: "12:30", breakEnd: "13:00" },
  { dayOfWeek: "WEDNESDAY", startTime: "08:40", endTime: "12:30", breakStart: null, breakEnd: null },
];
const mid = previewMoment("midday", svs);
check("middagpauze op maandag", mid[0].slot === "12:30-13:00");
check("middagpauze vervalt op korte woensdag", mid[1].slot === null);
check("laatste kwartier op woensdag", previewMoment("end-15/15", svs)[1].slot === "12:15-12:30");

console.log("6. Startsjabloon door de privacycontrole");
const allow = buildAllowList(["Shri Vishnu School"]);
for (const t of SCHEDULE_ITEM_TEMPLATES) {
  const r = scanFields({ Naam: t.label, Toelichting: t.aiHint }, allow, ["block", "ai"]);
  check(`sjabloon "${t.label}"`, r.length === 0, JSON.stringify(r));
}
check("naam met aanspreekvorm wordt tegengehouden",
  scanFields({ Naam: "Gym met meester Ravi" }, allow, ["block", "ai"]).length > 0);

console.log(`\n${passed} geslaagd, ${failures.length} mislukt.`);
if (failures.length > 0) process.exitCode = 1;
