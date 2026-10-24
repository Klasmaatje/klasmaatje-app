// Beheerscherm schoolrooster: vertaling tussen wat de directie invult en wat
// in de database staat.
//
// - Schooltijden per dag (SchoolDaySchedule): controleren en netjes maken.
// - Vaste dagonderdelen (ScheduleItem.defaultTime): het anker ("start/5",
//   "end-15/15", "10:15/15", "midday", null) omzetten naar gewone velden
//   ("Begin van de dag, 5 minuten") en terug. Zie lib/schedule-items.ts voor
//   de notatie. De directie hoeft de notatie nooit te zien.
//
// Puur bestand: geen Prisma- of Next-imports, zodat het overal te testen is.

import { type DaySchedule, isValidDefaultTime, resolveDefaultTime, toMinutes } from "./schedule-items";

// ---------- Tijden ----------

/** "8:30" -> "08:30". Geeft null bij een ongeldige tijd. */
export function normalizeTime(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ---------- Schooltijden per dag ----------

export type DayInput = {
  open: boolean; // false = die dag geen school (geen rij in SchoolDaySchedule)
  startTime: string;
  endTime: string;
  breakStart: string; // leeg = geen aparte middagpauze
  breakEnd: string;
};

export type DayResult =
  | { ok: true; day: DaySchedule | null } // null = geen school
  | { ok: false; error: string };

/** Controleert de schooltijden van één dag en maakt ze netjes. */
export function validateDay(input: DayInput, dayLabel: string): DayResult {
  if (!input.open) return { ok: true, day: null };

  const start = normalizeTime(input.startTime);
  const end = normalizeTime(input.endTime);
  if (!start || !end) return { ok: false, error: `${dayLabel}: vul een begin- en eindtijd in.` };
  if (toMinutes(start) >= toMinutes(end)) {
    return { ok: false, error: `${dayLabel}: de eindtijd moet na de begintijd liggen.` };
  }

  const hasBreakStart = input.breakStart.trim() !== "";
  const hasBreakEnd = input.breakEnd.trim() !== "";
  if (!hasBreakStart && !hasBreakEnd) {
    return { ok: true, day: { startTime: start, endTime: end, breakStart: null, breakEnd: null } };
  }
  if (hasBreakStart !== hasBreakEnd) {
    return { ok: false, error: `${dayLabel}: vul bij de middagpauze zowel begin als eind in, of laat beide leeg.` };
  }
  const bStart = normalizeTime(input.breakStart);
  const bEnd = normalizeTime(input.breakEnd);
  if (!bStart || !bEnd) return { ok: false, error: `${dayLabel}: ongeldige tijd bij de middagpauze.` };
  if (toMinutes(bStart) >= toMinutes(bEnd)) {
    return { ok: false, error: `${dayLabel}: de middagpauze moet eindigen na het begin.` };
  }
  if (toMinutes(bStart) <= toMinutes(start) || toMinutes(bEnd) >= toMinutes(end)) {
    return { ok: false, error: `${dayLabel}: de middagpauze moet binnen de schooldag vallen.` };
  }
  return { ok: true, day: { startTime: start, endTime: end, breakStart: bStart, breakEnd: bEnd } };
}

// ---------- Vaste dagonderdelen: anker <-> velden ----------

export type MomentKind = "start" | "end" | "clock" | "midday" | "weekly";

export type MomentFields = {
  kind: MomentKind;
  offset: number; // start: minuten NA de start; end: minuten VOOR het einde
  clock: string; // alleen bij "clock": "10:15"
  duration: number; // minuten
};

export const MOMENT_KIND_LABEL: Record<MomentKind, string> = {
  start: "Vanaf het begin van de schooldag",
  end: "Aan het einde van de schooldag",
  clock: "Op een vaste kloktijd",
  midday: "Tijdens de middagpauze (uit de schooltijden)",
  weekly: "Geen vaste tijd (weekles, dag en tijd per groep)",
};

export const MIN_DURATION = 5;
export const MAX_DURATION = 240;
export const MAX_OFFSET = 480;

const DEFAULT_FIELDS: MomentFields = { kind: "start", offset: 0, clock: "10:15", duration: 15 };

/** Anker uit de database -> velden voor het formulier. */
export function parseMoment(defaultTime: string | null): MomentFields {
  if (defaultTime === null) return { ...DEFAULT_FIELDS, kind: "weekly" };
  const value = defaultTime.trim();
  if (value === "midday") return { ...DEFAULT_FIELDS, kind: "midday" };

  const m = /^(start|end|\d{1,2}:\d{2})([+-]\d{1,3})?\/(\d{1,3})$/.exec(value);
  if (!m) return { ...DEFAULT_FIELDS };
  const shift = m[2] ? Number(m[2]) : 0;
  const duration = Number(m[3]);
  if (m[1] === "start") return { ...DEFAULT_FIELDS, kind: "start", offset: Math.max(0, shift), duration };
  if (m[1] === "end") return { ...DEFAULT_FIELDS, kind: "end", offset: Math.max(0, -shift), duration };
  // Kloktijd met verschuiving komt in de sjablonen niet voor; we rekenen hem om.
  const clock = normalizeTime(m[1]) ?? DEFAULT_FIELDS.clock;
  const minutes = toMinutes(clock) + shift;
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return {
    ...DEFAULT_FIELDS,
    kind: "clock",
    clock: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
    duration,
  };
}

export type MomentResult = { ok: true; defaultTime: string | null } | { ok: false; error: string };

/** Velden uit het formulier -> anker voor de database (met controle). */
export function composeMoment(f: MomentFields): MomentResult {
  if (f.kind === "weekly") return { ok: true, defaultTime: null };
  if (f.kind === "midday") return { ok: true, defaultTime: "midday" };

  if (!Number.isInteger(f.duration) || f.duration < MIN_DURATION || f.duration > MAX_DURATION) {
    return { ok: false, error: `De duur moet tussen ${MIN_DURATION} en ${MAX_DURATION} minuten liggen.` };
  }

  let defaultTime: string;
  if (f.kind === "clock") {
    const clock = normalizeTime(f.clock);
    if (!clock) return { ok: false, error: "Vul een geldige kloktijd in, bijvoorbeeld 10:15." };
    defaultTime = `${clock}/${f.duration}`;
  } else {
    if (!Number.isInteger(f.offset) || f.offset < 0 || f.offset > MAX_OFFSET) {
      return { ok: false, error: `Het aantal minuten moet tussen 0 en ${MAX_OFFSET} liggen.` };
    }
    if (f.kind === "start") {
      defaultTime = f.offset === 0 ? `start/${f.duration}` : `start+${f.offset}/${f.duration}`;
    } else {
      if (f.offset < f.duration) {
        return {
          ok: false,
          error: "Dit moment loopt door na het einde van de schooldag. Laat het eerder beginnen of maak het korter.",
        };
      }
      defaultTime = `end-${f.offset}/${f.duration}`;
    }
  }

  if (!isValidDefaultTime(defaultTime)) return { ok: false, error: "Ongeldig moment." };
  return { ok: true, defaultTime };
}

/** Korte omschrijving voor de lijst, bv. "5 min na de start, 30 min". */
export function describeMoment(defaultTime: string | null): string {
  const f = parseMoment(defaultTime);
  switch (f.kind) {
    case "weekly":
      return "Geen vaste tijd (weekles)";
    case "midday":
      return "Middagpauze uit de schooltijden";
    case "clock":
      return `Om ${f.clock}, ${f.duration} min`;
    case "start":
      return f.offset === 0
        ? `Bij de start van de dag, ${f.duration} min`
        : `${f.offset} min na de start, ${f.duration} min`;
    case "end":
      return f.offset === f.duration
        ? `Laatste ${f.duration} min van de dag`
        : `${f.offset} min voor het einde, ${f.duration} min`;
  }
}

/** "Alle groepen", "Groep 1 en 2", "Groep 3 t/m 8", "Groep 1, 4 en 6". */
export function describeGrades(grades: number[]): string {
  const g = [...new Set(grades)].filter((n) => n >= 1 && n <= 8).sort((a, b) => a - b);
  if (g.length === 0 || g.length === 8) return "Alle groepen";
  const consecutive = g.every((n, i) => i === 0 || n === g[i - 1] + 1);
  if (g.length >= 3 && consecutive) return `Groep ${g[0]} t/m ${g[g.length - 1]}`;
  if (g.length === 1) return `Groep ${g[0]}`;
  return `Groep ${g.slice(0, -1).join(", ")} en ${g[g.length - 1]}`;
}

/** Leerjaren uit het formulier: alleen 1-8, uniek, gesorteerd. Alle 8 aangevinkt = leeg (alle). */
export function cleanGrades(values: string[]): number[] {
  const g = [...new Set(values.map(Number))]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 8)
    .sort((a, b) => a - b);
  return g.length === 8 ? [] : g;
}

export type DayPreview = { weekday: string; slot: string | null }; // null = vervalt die dag

/** Hoe valt dit moment op elke schooldag? Voor de voorvertoning in het beheerscherm. */
export function previewMoment(
  defaultTime: string | null,
  days: (DaySchedule & { dayOfWeek: string })[]
): DayPreview[] {
  return days.map((d) => {
    const slot = resolveDefaultTime(defaultTime, d);
    return { weekday: d.dayOfWeek, slot: slot ? `${slot.start}-${slot.end}` : null };
  });
}

export const CATEGORY_OPTIONS = [
  { value: "routine", label: "Vast moment (routine)" },
  { value: "pauze", label: "Pauze" },
  { value: "vakles", label: "Vakdocent of vakleerkracht" },
] as const;

export type Category = (typeof CATEGORY_OPTIONS)[number]["value"];

export function isCategory(value: string): value is Category {
  return CATEGORY_OPTIONS.some((c) => c.value === value);
}

export const MAX_LABEL = 60;
export const MAX_AI_HINT = 300;
