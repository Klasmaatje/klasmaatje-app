// Vrije blokken op een schooldag: de tijd tussen vaste momenten en al
// ingeplande lessen. Daarbinnen mag een AI-voorstel lessen plannen.
// Puur bestand.

import { fromMinutes, toMinutes } from "../schedule-items";
import type { TimeBlock } from "./types";

export function parseSlot(slot: string): TimeBlock | null {
  const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(slot);
  return m ? { start: m[1], end: m[2] } : null;
}

export function freeBlocks(
  dayStart: string,
  dayEnd: string,
  occupied: TimeBlock[],
  minMinutes = 20
): TimeBlock[] {
  const busy = occupied
    .map((b) => [toMinutes(b.start), toMinutes(b.end)] as const)
    .sort((a, b) => a[0] - b[0]);
  const result: TimeBlock[] = [];
  let cursor = toMinutes(dayStart);
  const end = toMinutes(dayEnd);
  for (const [s, e] of busy) {
    if (s - cursor >= minMinutes) result.push({ start: fromMinutes(cursor), end: fromMinutes(Math.min(s, end)) });
    cursor = Math.max(cursor, e);
  }
  if (end - cursor >= minMinutes) result.push({ start: fromMinutes(cursor), end: fromMinutes(end) });
  return result;
}

/** Valt [start, end] helemaal binnen een van de blokken? */
export function fitsInBlocks(slot: TimeBlock, blocks: TimeBlock[]): boolean {
  const s = toMinutes(slot.start);
  const e = toMinutes(slot.end);
  return e > s && blocks.some((b) => s >= toMinutes(b.start) && e <= toMinutes(b.end));
}

export function overlaps(a: TimeBlock, b: TimeBlock): boolean {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}
