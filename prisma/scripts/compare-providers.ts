// Blok D: AI-providervergelijking OpenAI versus Claude (blind).
// Twee soorten opdrachten: (1) weekplanning, (2) lespakket uit groep + vak + leerdoel.
//
// Draaien (op de laptop, sleutels staan alleen in .env):
//   npx tsx prisma/scripts/compare-providers.ts           -> OpenAI en Claude
//   npx tsx prisma/scripts/compare-providers.ts --proef   -> zonder sleutels, twee keer oefenmodus (test van het script)
//   npx tsx prisma/scripts/compare-providers.ts --alleen openai   (of anthropic)
//        -> alleen die aanbieder (geen A/B-vergelijking), bijv. om een verbeterde prompt te toetsen
//   npx tsx prisma/scripts/compare-providers.ts --herhaal vergelijking/<map> <casus> <A|B>
//        -> één uitkomst opnieuw laten maken (bijv. na een fout). Blijft blind: de aanbieder
//           wordt uit sleutel.json gelezen maar niet getoond. Nieuwe uitkomst als
//           casus-<n>-<letter>-poging-<k>.md; extra regel in metingen.csv (telt mee in kosten).
//
// Uitsluitend FICTIEVE testgegevens: fictieve school, groepen en rooster. Geen database,
// geen leerlinggegevens, geen SHON-informatie naar de API's.
//
// Uitkomst in vergelijking/<datum-tijd>/ (staat niet in git):
//   casus-<n>-A.md / -B.md   leesbare uitkomst (weekplanning of lespakket), ZONDER naam van de aanbieder
//   beoordeling.md           invulformulier (rubric) voor de blinde beoordeling
//   metingen.csv             doorlooptijd, tokens, geschatte kosten, controles, per letter
//                            (weekplanning: lessen geaccepteerd/afgekeurd; lespakket: 1 = controles in orde, aantal opmerkingen)
//   sleutel.json             welke letter welke aanbieder is: PAS OPENEN NA HET BEOORDELEN
//
// Kosten: zet de actuele prijzen (dollar per 1 miljoen tokens) in .env als
//   PRICE_OPENAI_IN, PRICE_OPENAI_OUT, PRICE_ANTHROPIC_IN, PRICE_ANTHROPIC_OUT
// (opzoeken op het moment van testen); zonder prijzen blijft de kolom leeg.

import "dotenv/config";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { NoObjectGeneratedError } from "ai";
import { generateLessonPackage, generateWeekPlanDraft } from "../../lib/ai";
import { renderLessonMarkdown, type LessonRequest } from "../../lib/ai/lesson";
import { openaiConfigured, openaiProvider } from "../../lib/ai/providers/openai";
import { anthropicConfigured, anthropicProvider } from "../../lib/ai/providers/anthropic";
import { mockProvider } from "../../lib/ai/providers/mock";
import type { AiProvider, DraftDay, DraftRequest } from "../../lib/ai/types";

// ---------- Fictieve testcasussen ----------

const WEEKDAYS: [string, string][] = [
  ["MONDAY", "Maandag 2 november"],
  ["TUESDAY", "Dinsdag 3 november"],
  ["WEDNESDAY", "Woensdag 4 november"],
  ["THURSDAY", "Donderdag 5 november"],
  ["FRIDAY", "Vrijdag 6 november"],
];

/** Fictief rooster: 08:30-14:30, woensdag tot 12:15. Vaste momenten en vrije blokken. */
function days(kleuter: boolean): DraftDay[] {
  return WEEKDAYS.map(([weekday, label]) => {
    const short = weekday === "WEDNESDAY";
    const end = short ? "12:15" : "14:30";
    const fixed = [
      { time: "08:30-08:40", label: "Inloop en gebed" },
      { time: "10:15-10:30", label: "Pauze" },
      ...(short ? [] : [{ time: "12:00-12:30", label: "Lunch en middagpauze" }]),
      ...(kleuter ? [{ time: "08:40-09:00", label: "Kring" }] : []),
      { time: `${short ? "12:05" : "14:20"}-${end}`, label: "Afsluiting" },
    ];
    const free = short
      ? [{ start: kleuter ? "09:00" : "08:40", end: "10:15" }, { start: "10:30", end: "12:05" }]
      : [
          { start: kleuter ? "09:00" : "08:40", end: "10:15" },
          { start: "10:30", end: "12:00" },
          { start: "12:30", end: "14:20" },
        ];
    return { weekday, label, startTime: "08:30", endTime: end, fixed, free };
  });
}

const CASES: { title: string; request: DraftRequest }[] = [
  {
    title: "Groep 1-2, thema Herfst",
    request: {
      groupName: "Fictief 1/2A",
      grades: [1, 2],
      weekLabel: "Week 45 (fictief)",
      thema: "Herfst",
      bijzonderheden: "Donderdagmiddag bezoek aan het park met de groep.",
      methods: [],
      days: days(true),
    },
  },
  {
    title: "Groep 3-4, thema Diwali",
    request: {
      groupName: "Fictief 3/4B",
      grades: [3, 4],
      weekLabel: "Week 45 (fictief)",
      thema: "Diwali",
      bijzonderheden: "Vrijdag viering in de aula van 13:00 tot 14:00. Rekenen: aandacht voor optellen tot 100 met tientallen.",
      methods: [
        { name: "Getal en Ruimte Junior", subject: "Rekenen" },
        { name: "Veilig leren lezen", subject: "Lezen" },
        { name: "Staal", subject: "Taal en spelling" },
      ],
      days: days(false),
    },
  },
  {
    title: "Groep 7-8, thema Duurzaamheid",
    request: {
      groupName: "Fictief 7/8C",
      grades: [7, 8],
      weekLabel: "Week 45 (fictief)",
      thema: "Duurzaamheid",
      bijzonderheden: "Woensdag gymles van 08:40 tot 09:25 door de vakleerkracht. Rekenen: breuken vergelijken en gelijknamig maken.",
      methods: [
        { name: "Getal en Ruimte Junior", subject: "Rekenen" },
        { name: "Staal", subject: "Taal en spelling" },
        { name: "Blink", subject: "Wereldoriëntatie" },
      ],
      days: days(false),
    },
  },
];

const LESSON_CASES: { title: string; request: LessonRequest }[] = [
  {
    title: "Lespakket groep 2, rekenen: tellen tot 10",
    request: {
      grades: [2],
      subject: "Rekenen (kleuters)",
      learningGoal: "Ik kan tot 10 tellen en hoeveelheden tot 10 herkennen.",
      method: null,
      minutes: 20, // rekenkring kleuters ca. 20 min (Kwaliteitskaart Rekenonderwijs)
      focus: "Een groepje telt nog niet synchroon (wijzen en tellen tegelijk).",
    },
  },
  {
    title: "Lespakket groep 5, rekenen: breuken vergelijken",
    request: {
      grades: [5],
      subject: "Rekenen",
      learningGoal: "Ik kan breuken met dezelfde noemer vergelijken.",
      method: "Getal en Ruimte Junior",
      minutes: 60,
      focus: "Een deel van de groep verwart teller en noemer.",
    },
  },
  {
    title: "Lespakket groep 7, begrijpend lezen: hoofdgedachte",
    request: {
      grades: [7],
      subject: "Begrijpend lezen",
      learningGoal: "Ik kan de hoofdgedachte van een informatieve tekst vinden.",
      method: null,
      minutes: 45,
      focus: null,
    },
  },
];

// ---------- Uitvoeren ----------

type Run = {
  provider: AiProvider;
  key: "openai" | "anthropic" | "proef1" | "proef2";
};

type Result = {
  caseIndex: number;
  letter: "A" | "B";
  run: Run;
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
  accepted: number;
  skipped: number;
  error?: string;
  markdown: string;
};

/** Foutmelding met reden (bijv. afgekapt door het lengteplafond) en tokens, zonder inhoud. */
function describeError(e: unknown): { error: string; outputTokens?: number; inputTokens?: number } {
  if (NoObjectGeneratedError.isInstance(e)) {
    return {
      error: `${e.message} Reden: ${e.finishReason ?? "onbekend"}${e.finishReason === "length" ? " (lengteplafond bereikt)" : ""}.`,
      inputTokens: e.usage?.inputTokens,
      outputTokens: e.usage?.outputTokens,
    };
  }
  return { error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function price(key: string, dir: "IN" | "OUT"): number | null {
  const name = key === "openai" ? "OPENAI" : key === "anthropic" ? "ANTHROPIC" : null;
  if (!name) return null;
  const v = Number(process.env[`PRICE_${name}_${dir}`]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function costUsd(r: Result): string {
  const pin = price(r.run.key, "IN");
  const pout = price(r.run.key, "OUT");
  if (pin === null || pout === null || r.inputTokens === undefined || r.outputTokens === undefined) return "";
  return ((r.inputTokens * pin + r.outputTokens * pout) / 1_000_000).toFixed(4);
}

function renderPlan(title: string, req: DraftRequest, letter: string, lessons: Awaited<ReturnType<typeof generateWeekPlanDraft>>["lessons"], skipped: number): string {
  const lines = [
    `# ${title}: uitkomst ${letter}`,
    "",
    `Thema: ${req.thema ?? "geen"} · Bijzonderheden: ${req.bijzonderheden ?? "geen"}`,
    `Controle: ${lessons.length} lessen passen in de vrije blokken; ${skipped} voorgestelde lessen afgekeurd (buiten vrije blokken, ongeldige tijd of overlap).`,
    "",
  ];
  for (const day of req.days) {
    lines.push(`## ${day.label}`, "");
    const items = [
      ...day.fixed.map((f) => ({ time: f.time, text: `*${f.label}* (vast moment)` })),
      ...lessons
        .filter((l) => l.dag === day.weekday)
        .map((l) => ({
          time: `${l.start}-${l.end}`,
          text: `**${l.subject}**\n  - Basis: ${l.goalBasis}\n  - Verlengd: ${l.goalVerlengd}\n  - Verrijking: ${l.goalVerrijking}`,
        })),
    ].sort((a, b) => a.time.localeCompare(b.time));
    for (const it of items) lines.push(`- ${it.time} ${it.text}`);
    lines.push("");
  }
  return lines.join("\n");
}

const RUBRIC = [
  "Didactische kwaliteit (EDI: concreet lesdoel 'Ik kan ...', opbouw, passend bij de leeftijd)",
  "Differentiatie (basis, verlengd, verrijking echt verschillend en bruikbaar)",
  "Juistheid (inhoudelijk klopt het, geen fouten of verzinsels)",
  "Aansluiting op ons format en onze kaders (weekplanning, methodes, thema, bijzonderheden verwerkt)",
  "Benodigde correcties (5 = vrijwel direct bruikbaar, 1 = veel herschrijven)",
];

/** Vragen die geen score 1-5 zijn, maar nodig voor tijdwinst en kosten per bruikbaar resultaat. */
const PRACTICAL = [
  "Bruikbaar na deze ene generatie? (ja / nee, opnieuw laten maken)",
  "Minuten nodig om te controleren en aan te passen",
  "Minuten als je het zelf zou voorbereiden",
];

const LESSON_RUBRIC = [
  "Direct bruikbaar (5 = zo te geven, 1 = grotendeels herschrijven); lang is niet beter",
  "Didactische kwaliteit: instructie, voorbeelden en opbouw kloppen (EDI); bij groep 2 passend bij kleuters (spelend leren)",
  "Differentiatie intensief / basis / verrijking echt verschillend en passend",
  "Inhoudelijke juistheid (sommen, antwoorden, uitleg)",
  "Werkblad en beschrijving visueel materiaal bruikbaar",
];

function renderRubric(stamp: string): string {
  const lines = [
    `# Blinde beoordeling AI-weekplanningen (${stamp})`,
    "",
    "Beoordeel per casus uitkomst A en B, zonder sleutel.json te openen. Score 1 (zwak) tot 5 (sterk).",
    "Beoordelaars: ______________________ (bijv. leerkracht onderbouw, leerkracht bovenbouw, IB'er)",
    "",
  ];
  CASES.forEach((c, i) => {
    lines.push(`## Casus ${i + 1}: ${c.title}`, "", "| Criterium | A | B |", "| --- | --- | --- |");
    for (const r of RUBRIC) lines.push(`| ${r} |  |  |`);
    for (const r of PRACTICAL) lines.push(`| ${r} |  |  |`);
    lines.push("| Voorkeur (A, B of gelijk) en waarom |  |  |", "");
  });
  LESSON_CASES.forEach((c, i) => {
    lines.push(`## Casus ${CASES.length + i + 1}: ${c.title}`, "", "| Criterium | A | B |", "| --- | --- | --- |");
    for (const r of LESSON_RUBRIC) lines.push(`| ${r} |  |  |`);
    for (const r of PRACTICAL) lines.push(`| ${r} |  |  |`);
    lines.push("| Voorkeur (A, B of gelijk) en waarom |  |  |", "");
  });
  lines.push(
    "## Daarna",
    "",
    "1. Tel de scores per letter per casus op.",
    "2. Open dan pas sleutel.json en metingen.csv (doorlooptijd, tokens, kosten, lengte).",
    "3. Bespreek de uitkomst met Claude voor het adviesstuk: kwaliteit per taak (weekplanning en lespakket apart),",
    "   tijdwinst (zelf voorbereiden min controleren) en kosten per BRUIKBAAR resultaat (incl. opnieuw laten maken).",
    "   Het kan zijn dat de ene aanbieder beter is voor weekplanningen en de andere voor lespakketten.",
    "",
    "Let op: zes casussen zijn genoeg voor een eerste richting, niet voor een definitieve keuze."
  );
  return lines.join("\n");
}

/** Eén uitkomst opnieuw laten maken, blind (aanbieder niet tonen). */
async function retry(dir: string, casus: number, letter: "A" | "B") {
  const key = JSON.parse(readFileSync(join(dir, "sleutel.json"), "utf8")) as { casus: number; uitkomst: string; aanbieder: string }[];
  const entry = key.find((k) => k.casus === casus && k.uitkomst === letter);
  if (!entry) throw new Error(`Casus ${casus} uitkomst ${letter} niet gevonden in ${dir}.`);
  const run: Run = entry.aanbieder === openaiProvider.name
    ? { provider: openaiProvider, key: "openai" }
    : entry.aanbieder === anthropicProvider.name
      ? { provider: anthropicProvider, key: "anthropic" }
      : { provider: mockProvider, key: "proef1" };
  const caseIndex = casus - 1;
  const isLesson = caseIndex >= CASES.length;
  const title = isLesson ? LESSON_CASES[caseIndex - CASES.length]?.title : CASES[caseIndex]?.title;
  if (!title) throw new Error(`Casus ${casus} bestaat niet.`);
  let attempt = 2;
  while (true) {
    try { readFileSync(join(dir, `casus-${casus}-${letter}-poging-${attempt}.md`)); attempt++; } catch { break; }
  }
  process.stdout.write(`  casus ${casus} uitkomst ${letter}, poging ${attempt} ... `);
  const t0 = performance.now();
  let row: Result;
  try {
    if (isLesson) {
      const c = LESSON_CASES[caseIndex - CASES.length];
      const out = await generateLessonPackage(c.request, run.provider);
      row = { caseIndex, letter, run, ms: performance.now() - t0, inputTokens: out.usage?.inputTokens, outputTokens: out.usage?.outputTokens,
        accepted: out.notes.length === 0 ? 1 : 0, skipped: out.notes.length, markdown: renderLessonMarkdown(`${c.title} (poging ${attempt})`, c.request, letter, out.pkg, out.notes) };
    } else {
      const c = CASES[caseIndex];
      const out = await generateWeekPlanDraft(c.request, run.provider);
      row = { caseIndex, letter, run, ms: performance.now() - t0, inputTokens: out.usage?.inputTokens, outputTokens: out.usage?.outputTokens,
        accepted: out.lessons.length, skipped: out.skipped, markdown: renderPlan(`${c.title} (poging ${attempt})`, c.request, letter, out.lessons, out.skipped) };
    }
    console.log(`klaar (${(row.ms / 1000).toFixed(1)} s)`);
  } catch (e) {
    const { error, inputTokens, outputTokens } = describeError(e);
    row = { caseIndex, letter, run, ms: performance.now() - t0, inputTokens, outputTokens, accepted: 0, skipped: 0, error, markdown: `# ${title}: uitkomst ${letter} (poging ${attempt})\n\nGeen uitkomst: fout bij de aanbieder.\n` };
    console.log("fout (zie metingen.csv)");
  }
  writeFileSync(join(dir, `casus-${casus}-${letter}-poging-${attempt}.md`), row.markdown);
  appendFileSync(
    join(dir, "metingen.csv"),
    "\n" + [casus, isLesson ? "lespakket" : "weekplanning", `${letter} (poging ${attempt})`, (row.ms / 1000).toFixed(1), row.inputTokens ?? "", row.outputTokens ?? "", costUsd(row),
      row.error ? "" : words(row.markdown), row.accepted, row.skipped, (row.error ?? "").replace(/[;\n]/g, " ")].join(";")
  );
  console.log(`Klaar. Nieuwe uitkomst: ${join(dir, `casus-${casus}-${letter}-poging-${attempt}.md`)}`);
}

async function main() {
  const h = process.argv.indexOf("--herhaal");
  if (h !== -1) {
    const [dir, casus, letter] = process.argv.slice(h + 1, h + 4);
    if (!dir || !casus || (letter !== "A" && letter !== "B")) {
      console.error("Gebruik: --herhaal vergelijking/<map> <casus> <A|B>");
      process.exitCode = 1;
      return;
    }
    await retry(dir, Number(casus), letter);
    return;
  }
  const proef = process.argv.includes("--proef");
  const a = process.argv.indexOf("--alleen");
  const only = a !== -1 ? process.argv[a + 1] : null;
  if (only && only !== "openai" && only !== "anthropic") {
    console.error("Gebruik: --alleen openai  of  --alleen anthropic");
    process.exitCode = 1;
    return;
  }
  const all: Run[] = proef
    ? [{ provider: mockProvider, key: "proef1" }, { provider: mockProvider, key: "proef2" }]
    : [{ provider: openaiProvider, key: "openai" }, { provider: anthropicProvider, key: "anthropic" }];
  const runs: Run[] = only ? all.filter((r) => r.key === only) : all;

  if (!proef) {
    const missing = [
      (!only || only === "openai") && !openaiConfigured() && "OPENAI_API_KEY",
      (!only || only === "anthropic") && !anthropicConfigured() && "ANTHROPIC_API_KEY",
    ].filter(Boolean);
    if (missing.length > 0) {
      console.error(`Ontbreekt in .env: ${missing.join(", ")}. Gebruik --proef om het script zonder sleutels te testen.`);
      process.exitCode = 1;
      return;
    }
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const dir = join("vergelijking", proef ? `${stamp}-proef` : only ? `${stamp}-${only}` : stamp);
  mkdirSync(dir, { recursive: true });

  console.log(`AI-vergelijking${proef ? " (proef, oefenmodus)" : ""}: ${CASES.length + LESSON_CASES.length} fictieve casussen x ${runs.length} aanbieders`);
  const results: Result[] = [];
  for (const [caseIndex, c] of CASES.entries()) {
    // Willekeurige volgorde per casus: zo zegt de letter niets over de aanbieder.
    const order = randomInt(2) === 0 ? runs : [...runs].reverse();
    for (const [i, run] of order.entries()) {
      const letter = i === 0 ? "A" : "B";
      process.stdout.write(`  casus ${caseIndex + 1} uitkomst ${letter} ... `);
      const t0 = performance.now();
      try {
        const out = await generateWeekPlanDraft(c.request, run.provider);
        const ms = performance.now() - t0;
        results.push({
          caseIndex, letter, run, ms,
          inputTokens: out.usage?.inputTokens, outputTokens: out.usage?.outputTokens,
          accepted: out.lessons.length, skipped: out.skipped,
          markdown: renderPlan(c.title, c.request, letter, out.lessons, out.skipped),
        });
        console.log(`klaar (${(ms / 1000).toFixed(1)} s, ${out.lessons.length} lessen)`);
      } catch (e) {
        const ms = performance.now() - t0;
        const { error, inputTokens, outputTokens } = describeError(e);
        results.push({ caseIndex, letter, run, ms, inputTokens, outputTokens, accepted: 0, skipped: 0, error, markdown: `# ${c.title}: uitkomst ${letter}\n\nGeen uitkomst: fout bij de aanbieder.\n` });
        console.log("fout (zie metingen.csv)");
      }
    }
  }

  for (const [j, c] of LESSON_CASES.entries()) {
    const caseIndex = CASES.length + j;
    const order = randomInt(2) === 0 ? runs : [...runs].reverse();
    for (const [i, run] of order.entries()) {
      const letter = i === 0 ? "A" : "B";
      process.stdout.write(`  casus ${caseIndex + 1} uitkomst ${letter} ... `);
      const t0 = performance.now();
      try {
        const out = await generateLessonPackage(c.request, run.provider);
        const ms = performance.now() - t0;
        results.push({
          caseIndex, letter, run, ms,
          inputTokens: out.usage?.inputTokens, outputTokens: out.usage?.outputTokens,
          accepted: out.notes.length === 0 ? 1 : 0, skipped: out.notes.length,
          markdown: renderLessonMarkdown(c.title, c.request, letter, out.pkg, out.notes),
        });
        console.log(`klaar (${(ms / 1000).toFixed(1)} s${out.notes.length ? `, ${out.notes.length} opmerkingen` : ""})`);
      } catch (e) {
        const ms = performance.now() - t0;
        const { error, inputTokens, outputTokens } = describeError(e);
        results.push({ caseIndex, letter, run, ms, inputTokens, outputTokens, accepted: 0, skipped: 0, error, markdown: `# ${c.title}: uitkomst ${letter}\n\nGeen uitkomst: fout bij de aanbieder.\n` });
        console.log("fout (zie metingen.csv)");
      }
    }
  }

  for (const r of results) writeFileSync(join(dir, `casus-${r.caseIndex + 1}-${r.letter}.md`), r.markdown);
  writeFileSync(join(dir, "beoordeling.md"), renderRubric(stamp));
  writeFileSync(
    join(dir, "metingen.csv"),
    [
      "casus;taak;uitkomst;doorlooptijd_s;input_tokens;output_tokens;geschatte_kosten_usd;woorden;geaccepteerd;afgekeurd_of_opmerkingen;fout",
      ...results.map((r) =>
        [r.caseIndex + 1, r.caseIndex < CASES.length ? "weekplanning" : "lespakket", r.letter, (r.ms / 1000).toFixed(1), r.inputTokens ?? "", r.outputTokens ?? "", costUsd(r), r.error ? "" : words(r.markdown), r.accepted, r.skipped, (r.error ?? "").replace(/[;\n]/g, " ")].join(";")
      ),
    ].join("\n")
  );
  writeFileSync(
    join(dir, "sleutel.json"),
    JSON.stringify(
      results.map((r) => ({ casus: r.caseIndex + 1, uitkomst: r.letter, aanbieder: r.run.provider.name, model: r.run.provider.model })),
      null,
      2
    )
  );
  console.log(`\nKlaar. Map: ${dir}`);
  console.log("Beoordeel eerst blind (beoordeling.md). Open sleutel.json pas daarna.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
