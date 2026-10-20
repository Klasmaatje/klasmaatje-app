// Weken en schooljaren. Een weekplan hoort bij een ISO-week, opgeslagen als
// "2026-W44" in WeekPlan.periode (sorteert goed, eenduidig). Voor de
// leerkracht tonen we "Week 44 · 26 t/m 30 oktober 2026".
// Puur bestand: geen Prisma- of Next-imports.

export const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
export type WeekdayKey = (typeof WEEKDAYS)[number];

export const WEEKDAY_NL: Record<WeekdayKey, string> = {
  MONDAY: "Maandag",
  TUESDAY: "Dinsdag",
  WEDNESDAY: "Woensdag",
  THURSDAY: "Donderdag",
  FRIDAY: "Vrijdag",
};

const DAY_MS = 86_400_000;

/** De datum van vandaag in Nederland, als UTC-middernacht (alleen de dag telt). */
export function todayInNetherlands(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // "2026-10-20"
  const [y, m, d] = parts.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** ISO-jaar en -weeknummer van een (UTC-)datum. */
export function isoWeekOf(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // donderdag van dezelfde week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function mondayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  return new Date(jan4.getTime() + ((week - 1) * 7 - (day - 1)) * DAY_MS);
}

export function periodeKey(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** "2026-W44" -> { year, week }, of null als het geen geldige week is. */
export function parsePeriode(value: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (year < 2020 || year > 2100 || week < 1 || week > 53) return null;
  // Week 53 bestaat niet elk jaar: controleer via de maandag.
  const check = isoWeekOf(mondayOfIsoWeek(year, week));
  if (check.year !== year || check.week !== week) return null;
  return { year, week };
}

/** Maandag t/m vrijdag van een periode, met datum. */
export function weekdayDates(periode: string): { weekday: WeekdayKey; date: Date }[] {
  const p = parsePeriode(periode);
  if (!p) return [];
  const monday = mondayOfIsoWeek(p.year, p.week);
  return WEEKDAYS.map((weekday, i) => ({ weekday, date: new Date(monday.getTime() + i * DAY_MS) }));
}

const dayMonth = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("nl-NL", { day: "numeric", timeZone: "UTC" });

export function formatShortDate(date: Date): string {
  return dayMonth.format(date); // "26 oktober"
}

/** "Week 44 · 26 t/m 30 oktober 2026" of "Week 27 · 29 juni t/m 3 juli 2026". */
export function formatPeriode(periode: string): string {
  const p = parsePeriode(periode);
  if (!p) return periode;
  const monday = mondayOfIsoWeek(p.year, p.week);
  const friday = new Date(monday.getTime() + 4 * DAY_MS);
  const sameMonth = monday.getUTCMonth() === friday.getUTCMonth();
  const from = sameMonth ? dayOnly.format(monday) : dayMonth.format(monday);
  return `Week ${p.week} · ${from} t/m ${dayMonth.format(friday)} ${friday.getUTCFullYear()}`;
}

/** Deze week en de komende weken, om uit te kiezen bij een nieuw weekplan. */
export function upcomingWeeks(today: Date, count = 4): { key: string; label: string }[] {
  const result: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const { year, week } = isoWeekOf(new Date(today.getTime() + i * 7 * DAY_MS));
    const key = periodeKey(year, week);
    result.push({ key, label: formatPeriode(key) });
  }
  return result;
}

/** Schooljaar van een datum: vanaf 1 augustus het nieuwe jaar. "2026/2027". */
export function schoolYearOf(date: Date): string {
  const y = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 7 ? y : y - 1;
  return `${start}/${start + 1}`;
}
