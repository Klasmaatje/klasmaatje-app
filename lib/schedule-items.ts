// Vaste dagonderdelen (ScheduleItem) omzetten naar echte tijden per dag.
//
// ScheduleItem.defaultTime bevat GEEN vaste kloktijd voor schoolgebonden
// momenten, maar een ANKER ten opzichte van het dagrooster van de school
// (SchoolDaySchedule). Zo klopt "gebed bij de start" op elke school en elke
// dag, ook op de korte woensdag en bij een continurooster.
//
// Notatie van defaultTime:
//   start/5        begin van de schooldag, 5 minuten
//   start+5/30     5 min na de start, 30 minuten
//   end-15/15      laatste kwartier van de dag
//   10:15/15       vaste kloktijd (bv. fruitpauze), 15 minuten
//   midday         middagpauze: de pauze uit het dagrooster (breakStart-breakEnd);
//                  zonder aparte pauze (continurooster) 12:00-12:30 op lange
//                  dagen; op korte dagen (einde voor 14:00) vervalt het moment.
//   null           vaste wekelijkse les zonder dagtijd (gym, vakdocent): de dag
//                  en tijd verschillen per groep en vult de leerkracht zelf in.
//
// Een moment dat buiten de schooldag valt, vervalt op die dag.
// Puur bestand: geen Prisma- of Next-imports, zodat het overal te testen is.

export type DaySchedule = {
  startTime: string; // "08:40"
  endTime: string; // "15:00"
  breakStart: string | null;
  breakEnd: string | null;
};

export type ScheduleItemLike = {
  label: string;
  defaultTime: string | null;
  category: string;
  sortOrder: number;
  targetGrades: number[];
};

export type ResolvedSlot = { start: string; end: string };

const LONG_DAY_END = "14:00"; // dagen die eerder eindigen tellen als korte dag
const MIDDAY_FALLBACK: ResolvedSlot = { start: "12:00", end: "12:30" };

export function toMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) throw new Error(`Ongeldige tijd: "${time}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Controleert of een defaultTime-waarde geldig is (voor seed en beheerscherm). */
export function isValidDefaultTime(value: string | null): boolean {
  if (value === null || value === "midday") return true;
  return /^(start|end|\d{1,2}:\d{2})([+-]\d{1,3})?\/\d{1,3}$/.test(value.trim());
}

/**
 * Zet een anker om naar begin- en eindtijd op een bepaalde dag.
 * Geeft null als het moment die dag niet bestaat (geen tijd, valt buiten de
 * schooldag, of middagpauze op een korte dag).
 */
export function resolveDefaultTime(
  defaultTime: string | null,
  day: DaySchedule
): ResolvedSlot | null {
  if (defaultTime === null) return null;
  const value = defaultTime.trim();
  const dayStart = toMinutes(day.startTime);
  const dayEnd = toMinutes(day.endTime);

  let slot: ResolvedSlot | null;
  if (value === "midday") {
    if (day.breakStart && day.breakEnd) {
      slot = { start: day.breakStart, end: day.breakEnd };
    } else if (dayEnd >= toMinutes(LONG_DAY_END)) {
      slot = MIDDAY_FALLBACK;
    } else {
      slot = null;
    }
  } else {
    const m = /^(start|end|\d{1,2}:\d{2})([+-]\d{1,3})?\/(\d{1,3})$/.exec(value);
    if (!m) throw new Error(`Ongeldige defaultTime: "${defaultTime}"`);
    const base = m[1] === "start" ? dayStart : m[1] === "end" ? dayEnd : toMinutes(m[1]);
    const begin = base + (m[2] ? Number(m[2]) : 0);
    slot = { start: fromMinutes(begin), end: fromMinutes(begin + Number(m[3])) };
  }

  if (!slot) return null;
  if (toMinutes(slot.start) < dayStart || toMinutes(slot.end) > dayEnd) return null;
  return slot;
}

/** Geldt dit item voor een groep met deze leerjaren? Leeg = alle leerjaren. */
export function appliesToGrades(item: Pick<ScheduleItemLike, "targetGrades">, grades: number[]) {
  return item.targetGrades.length === 0 || item.targetGrades.some((g) => grades.includes(g));
}

/**
 * Alle vaste momenten van één dag voor één groep, op tijd gesorteerd.
 * Items zonder dagtijd (gym, vakdocent) komen apart terug in `weekly`.
 */
export function resolveDayForGroup<T extends ScheduleItemLike>(
  items: T[],
  day: DaySchedule,
  grades: number[]
): { slots: (ResolvedSlot & { item: T })[]; weekly: T[] } {
  const relevant = items.filter((i) => appliesToGrades(i, grades));
  const slots = relevant
    .map((item) => {
      const slot = resolveDefaultTime(item.defaultTime, day);
      return slot ? { ...slot, item } : null;
    })
    .filter((s): s is ResolvedSlot & { item: T } => s !== null)
    .sort(
      (a, b) =>
        toMinutes(a.start) - toMinutes(b.start) || a.item.sortOrder - b.item.sortOrder
    );
  const weekly = relevant
    .filter((i) => i.defaultTime === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { slots, weekly };
}
