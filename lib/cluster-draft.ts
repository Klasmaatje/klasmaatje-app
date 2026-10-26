// Concept-clusterplan opstellen uit groepsreflecties. Puur (geen Prisma/Next).
//
// OEFENMODUS tot Blok D: dit is GEEN taalmodel maar een vaste opbouw uit wat de
// leerkracht zelf in de reflecties schreef. Zo is elk zinsdeel herleidbaar naar
// een reflectie. Na Blok D kan een AI-aanbieder hetzelfde contract invullen
// (zelfde invoer, zelfde uitvoer), waarna het concept nog steeds DRAFT is en
// een professional het aanpast en vaststelt.

import type { Level } from "./quality";

export type DraftSourceReflection = {
  periode: string; // "2026-W44"
  basis: Level | null;
  verlengd: Level | null;
  verrijking: Level | null;
  aandacht: string | null;
  vervolg: string | null;
};

export type ClusterDraft = {
  basisDoel: string;
  basisAanpak: string;
  intensiefDoel: string;
  intensiefAanpak: string;
  verrijkingDoel: string;
  verrijkingAanpak: string;
};

const MAX = 1000;

function weekNo(periode: string): string {
  const m = /^\d{4}-W(\d{2})$/.exec(periode);
  return m ? `week ${Number(m[1])}` : periode;
}

/** "in 2 van de 3 reflecties (week 42, 44)". Feitelijk, geen oordeel. */
function tally(reflections: DraftSourceReflection[], pick: (r: DraftSourceReflection) => Level | null, match: Level[]): string | null {
  const rated = reflections.filter((r) => pick(r) !== null);
  const hits = rated.filter((r) => match.includes(pick(r)!));
  if (rated.length === 0 || hits.length === 0) return null;
  return `in ${hits.length} van de ${rated.length} reflecties (${hits.map((r) => weekNo(r.periode)).join(", ")})`;
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))];
}

function clip(text: string): string {
  return text.length > MAX ? `${text.slice(0, MAX - 3)}...` : text;
}

/**
 * Bouwt een concept uit de reflecties (nieuwste eerst aangeleverd).
 * `goalTitle` is de titel van het gekoppelde kwaliteitsdoel (optioneel).
 */
export function draftClusterPlan(subject: string, reflections: DraftSourceReflection[], goalTitle?: string | null): ClusterDraft {
  const aandacht = unique(reflections.map((r) => r.aandacht));
  const vervolg = unique(reflections.map((r) => r.vervolg));
  const goalLine = goalTitle ? ` Gekoppeld kwaliteitsdoel: ${goalTitle}.` : "";

  const verlengdOpen = tally(reflections, (r) => r.verlengd, ["DEELS", "NOG_NIET"]);
  const basisOpen = tally(reflections, (r) => r.basis, ["DEELS", "NOG_NIET"]);
  const basisOk = tally(reflections, (r) => r.basis, ["GEHAALD"]);
  const verrijkingOk = tally(reflections, (r) => r.verrijking, ["GEHAALD"]);

  const intensiefDoel = [
    `De leerlingen in dit cluster beheersen de lesdoelen ${subject.toLowerCase()} waar de reflecties aandacht voor vragen.`,
    aandacht.length > 0 ? `Aandachtspunten uit de reflecties: ${aandacht.join(" ")}` : null,
    verlengdOpen ? `Verlengde instructie: doel nog niet of deels gehaald ${verlengdOpen}.` : null,
  ].filter(Boolean).join(" ");

  const intensiefAanpak = [
    "Verlengde instructie aan de instructietafel direct na de basisinstructie, met extra begeleide inoefening en controle van begrip.",
    vervolg.length > 0 ? `Meegenomen uit de reflecties: ${vervolg.join(" ")}` : null,
  ].filter(Boolean).join(" ");

  const basisDoel = [
    `De groep werkt aan de lesdoelen ${subject.toLowerCase()} uit de weekplanning.`,
    basisOk ? `Basisdoel gehaald ${basisOk}.` : null,
    basisOpen ? `Basisdoel deels of nog niet gehaald ${basisOpen}.` : null,
    goalLine.trim() || null,
  ].filter(Boolean).join(" ");

  const basisAanpak =
    "EDI-instructie volgens de weekplanning: lesdoel delen, stapsgewijze instructie, controle van begrip met wisbordjes en willekeurige beurten, daarna zelfstandig verwerken.";

  const verrijkingDoel = [
    `De leerlingen in dit cluster verdiepen de lesdoelen ${subject.toLowerCase()} en werken aan uitdagender toepassingen.`,
    verrijkingOk ? `Verrijkingsdoel gehaald ${verrijkingOk}.` : null,
  ].filter(Boolean).join(" ");

  const verrijkingAanpak =
    "Verkorte instructie, daarna verdiepende opdrachten; korte terugkoppeling aan het eind van de les.";

  return {
    intensiefDoel: clip(intensiefDoel),
    intensiefAanpak: clip(intensiefAanpak),
    basisDoel: clip(basisDoel),
    basisAanpak: clip(basisAanpak),
    verrijkingDoel: clip(verrijkingDoel),
    verrijkingAanpak: clip(verrijkingAanpak),
  };
}
