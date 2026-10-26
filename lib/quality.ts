// Kwaliteitslaag: labels en regels voor groepsreflectie en clusterplannen.
// Puur bestand: geen Prisma- of Next-imports (ook bruikbaar in scripts/tests).
//
// Uitgangspunten (kwaliteitslaag-ontwerpprincipes.md):
// - groepsniveau, geen leerlingdata;
// - een mens beoordeelt (inschatting, vaststellen, effect), de AI hooguit voorstellen;
// - neutrale taal: geen rode vlaggen, geen totaalcijfers.

// ---------- Groepsreflectie ----------

export const LEVELS = ["GEHAALD", "DEELS", "NOG_NIET"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABEL: Record<Level, string> = {
  GEHAALD: "Doel gehaald",
  DEELS: "Deels gehaald",
  NOG_NIET: "Nog niet gehaald",
};

/** Niveaus van de groep zoals in het weekplan (lesdoelen). */
export const REFLECTION_GROUPS = [
  { key: "basis", label: "Basis" },
  { key: "verlengd", label: "Verlengd" },
  { key: "verrijking", label: "Verrijking" },
] as const;

/** Leeg of onbekend -> null; anders de waarde. */
export function parseLevel(value: unknown): Level | null {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value) ? (value as Level) : null;
}

/** Lestypen waarover je reflecteert (geen routines, pauzes of vieringen). */
export const REFLECTABLE_LESSON_TYPES = ["les", "vakles", "toets"];

/** Unieke vakken uit de lessen van een plan, in vaste volgorde (alfabetisch). */
export function subjectsFromLessons(lessons: { type: string; subject: string }[]): string[] {
  const set = new Set(
    lessons
      .filter((l) => REFLECTABLE_LESSON_TYPES.includes(l.type))
      .map((l) => l.subject.trim())
      .filter(Boolean)
  );
  return [...set].sort((a, b) => a.localeCompare(b, "nl"));
}

// ---------- Clusterplan ----------

export const CP_DRAFT = "DRAFT";
export const CP_FIXED = "VASTGESTELD";
export const CP_EVALUATED = "GEEVALUEERD";

export const CLUSTER_STATUS_LABEL: Record<string, string> = {
  [CP_DRAFT]: "Concept",
  [CP_FIXED]: "Vastgesteld",
  [CP_EVALUATED]: "Geëvalueerd",
};

export const EFFECTS = ["JA", "DEELS", "NEE"] as const;
export type Effect = (typeof EFFECTS)[number];

export const EFFECT_LABEL: Record<Effect, string> = {
  JA: "Aanpak had effect",
  DEELS: "Deels effect",
  NEE: "Nog geen effect",
};

export function parseEffect(value: unknown): Effect | null {
  return typeof value === "string" && (EFFECTS as readonly string[]).includes(value) ? (value as Effect) : null;
}

// Volgorde en sterren zoals in de SHON-ambitiekaarten (*minimum, **basis, ***plus).
export const CLUSTERS = [
  { key: "intensief", label: "Intensief (*)", hint: "Verlengde instructie en extra begeleide inoefening, op groepsniveau beschreven." },
  { key: "basis", label: "Basis (**)", hint: "De instructie en verwerking zoals gepland." },
  { key: "verrijking", label: "Verrijking (***)", hint: "Verkorte instructie en verdiepende, uitdagende opdrachten." },
] as const;

/** Inhoud wijzigen kan tot het plan geëvalueerd is. */
export function canEditClusterContent(status: string): boolean {
  return status === CP_DRAFT || status === CP_FIXED;
}

/** Vaststellen kan alleen bij een concept. */
export function canFixClusterPlan(status: string): boolean {
  return status === CP_DRAFT;
}

/** Evalueren kan alleen bij een vastgesteld plan. */
export function canEvaluateClusterPlan(status: string): boolean {
  return status === CP_FIXED;
}

/** Na een inhoudelijke wijziging is het plan weer een concept (opnieuw vaststellen). */
export function clusterStatusAfterEdit(): string {
  return CP_DRAFT;
}
