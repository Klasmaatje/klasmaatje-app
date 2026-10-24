// Status van een weekplan: Concept -> Ingediend -> Goedgekeurd.
//
// - De leerkracht (groepslid) dient een concept in.
// - IB of directie van de school keurt een ingediend plan goed (een klik).
// - De leerkracht blijft eindredacteur: elke wijziging in een ingediend of
//   goedgekeurd plan zet het terug op Concept. Daarna dient hij opnieuw in.
// - Verwijderen kan alleen bij Concept.
//
// Puur bestand (geen Next.js, geen database), zodat het ook in tests draait.
// Wie welke knop mag gebruiken staat in lib/access.ts.

export const DRAFT = "DRAFT";
export const SUBMITTED = "SUBMITTED";
export const APPROVED = "APPROVED";

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Concept",
  SUBMITTED: "Ingediend",
  APPROVED: "Goedgekeurd",
  // Oudere waarden; worden niet meer gezet.
  REVIEWED: "Bekeken",
  ARCHIVED: "Gearchiveerd",
};

/** Mag dit plan worden ingediend? Alleen een concept met minstens een les. */
export function canSubmit(status: string, lessonCount: number): boolean {
  return status === DRAFT && lessonCount > 0;
}

/** Mag dit plan worden goedgekeurd? Alleen als het is ingediend. */
export function canApprove(status: string): boolean {
  return status === SUBMITTED;
}

/** Mag dit plan worden verwijderd? Alleen een concept. */
export function canDelete(status: string): boolean {
  return status === DRAFT;
}

/** Status na een wijziging door de leerkracht: altijd terug naar Concept. */
export function statusAfterEdit(): string {
  return DRAFT;
}
