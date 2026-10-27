// Clusterplan door AI, in het SHON-format (kwaliteitskaart OP2 h. 6: analyse,
// doelen, aanpak, evaluatie). Zelfde principe als het lespakket: de prompt
// (didactiek, spelregels) is universeel, de aanbieder levert alleen de tekst.
// De uitkomst is altijd een CONCEPT: leerkracht en IB passen aan, IB/directie
// stelt vast. Uitvoering, effect en vervolgbesluit kiest altijd een mens.
//
// Invoer: alleen groepsniveau. De reflectieteksten zijn vooraf door de
// privacycontrole gegaan (zie de server action); er gaan geen namen mee.

import { z } from "zod";
import { draftClusterPlan, type DraftSourceReflection } from "../cluster-draft";
import { LEVEL_LABEL, type Level } from "../quality";
import type { AiProvider, TokenUsage } from "./types";

export type ClusterSourceReflection = DraftSourceReflection & { goed: string | null };

export type ClusterRequest = {
  grades: number[];
  subject: string;
  startWeek: string; // "week 45"
  evaluatieWeek: string; // "week 49"
  goal: { code: string; title: string; norm: string | null; source: string } | null;
  reflections: ClusterSourceReflection[]; // nieuwste eerst
};

const Cluster = z.object({
  doel: z
    .string()
    .describe("1 tot 3 concrete leerdoelen voor dit cluster, elk met succescriterium ('Het is gelukt als ...'), meetwijze en moment"),
  aanpak: z
    .string()
    .describe("Basisaanbod en OOM-tijd: instructie en oefening, wie voert uit, hoe vaak en hoe lang per week, benodigde materialen"),
});

export const ClusterDraftSchema = z.object({
  analyse: z
    .string()
    .describe(
      "Groepsanalyse: beginsituatie (met weeknummers van de reflecties), wat de groep beheerst en wat nog niet, onderwijsbehoefte, vermoedelijke verklaring. Scheid waarneming en vermoeden."
    ),
  intensief: Cluster.describe("Cluster met verlengde instructie (SHON: *)"),
  basis: Cluster.describe("Basiscluster (SHON: **)"),
  verrijking: Cluster.describe("Cluster met verrijking (SHON: ***)"),
});
export type ClusterDraftOutput = z.infer<typeof ClusterDraftSchema>;

export const ClusterEvaluationSchema = z.object({
  evaluatie: z
    .string()
    .describe("Wat de reflecties in de looptijd laten zien per cluster, vergeleken met de doelen. Feitelijk, met weeknummers. Geen oordeel over uitvoering of effect."),
  vragen: z.array(z.string()).describe("2 of 3 vragen voor leerkracht en IB om uitvoering en effect samen te beoordelen"),
});

const MAX = 2000;
const clip = (s: string) => (s.trim().length > MAX ? `${s.trim().slice(0, MAX - 3)}...` : s.trim());

function weekNo(periode: string): string {
  const m = /^\d{4}-W(\d{2})$/.exec(periode);
  return m ? `week ${Number(m[1])}` : periode;
}

const lvl = (l: Level | null) => (l ? LEVEL_LABEL[l].toLowerCase() : "niet ingevuld");

function describeReflections(reflections: ClusterSourceReflection[]): string {
  if (reflections.length === 0) return "Geen groepsreflecties beschikbaar.";
  return reflections
    .map((r) =>
      [
        `- ${weekNo(r.periode)}: basis ${lvl(r.basis)}, verlengde instructie ${lvl(r.verlengd)}, verrijking ${lvl(r.verrijking)}.`,
        r.goed ? `  Ging goed: ${r.goed}` : null,
        r.aandacht ? `  Vraagt aandacht: ${r.aandacht}` : null,
        r.vervolg ? `  Vervolg: ${r.vervolg}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
}

const RULES = [
  "Spelregels:",
  "- Alles op groepsniveau. Gebruik nooit namen of andere persoonsgegevens. Deel geen leerlingen in clusters in; dat doet de leerkracht.",
  "- Gebruik alleen wat in de invoer staat. Verzin geen toetsscores, percentages, niveauwaarden of methodelessen. Ontbreekt informatie (bijvoorbeeld Cito M/E-gegevens), schrijf dan 'bewijs ontbreekt' of 'nog aan te vullen'.",
  "- Maak herleidbaar waar iets op gebaseerd is, met weeknummers ('in week 43 en 44 ...').",
  "- Doe geen uitspraak of een norm gehaald wordt; een plan draagt bij aan een doel, het bewijst niets.",
  "- Schrijf beknopt: per veld hooguit ongeveer 70 woorden. Helder, eenvoudig Nederlands.",
  "- Herhaal gemeenschappelijke afspraken (tussenmeting, evaluatiemoment, gebruikte reflecties) niet in elk cluster: noem ze één keer, in de analyse of bij het basiscluster.",
  "- Gebruik 'doel' of 'lesdoel', niet 'kerndoel' (dat is een vast SLO-begrip).",
].join("\n");

export function buildClusterPrompt(req: ClusterRequest): { system: string; user: string } {
  const kleuter = req.grades.some((g) => g <= 2);
  const system = [
    "Je bent een ervaren intern begeleider op een Nederlandse basisschool en schrijft een CONCEPT-clusterplan voor één groep, één vak en één periode.",
    "De leerkracht en de IB'er controleren en passen aan; daarna stelt de IB'er of directeur het plan vast.",
    "",
    "Werkwijze van het bestuur (kwaliteitskaart OP2):",
    "- Clusterplan en groepsanalyse vormen één werkdocument: analyse, doelen, aanpak, later evaluatie.",
    "- Doelen: een beperkt aantal concrete leerdoelen per cluster, met succescriterium, meetwijze en evaluatiemoment (een korte interventie in beginsel na vier weken).",
    "- Aanpak: basisaanbod volgens EDI (lesdoel, controle van begrip met wisbordjes of willekeurige beurten, begeleide inoefening) en doelgerichte OOM-tijd (Onderwijs op Maat): gerichte instructie, begeleide oefening, herhaling of verdieping. Een softwaretaak of zelfstandig werkuur is op zichzelf geen interventie.",
    "- Noem wie uitvoert (leerkracht, onderwijsassistent), hoe vaak en hoe lang per week, en welke materialen.",
    kleuter
      ? "- Groep 1-2: werk thematisch en spelend; de clusters heten weergroepje (intensief, herhalen), basis en meergroepje (verrijking). Geen werkbladen met veel tekst."
      : "- Intensief (*) = verlengde instructie: betere instructie en meer leertijd voor HETZELFDE doel, geen lager doel. Basis (**) = reguliere instructie. Verrijking (***) = verkorte instructie en open, complexere opdrachten.",
    "",
    RULES,
  ].join("\n");
  const user = [
    `Groep: ${req.grades.join("/")}`,
    `Vak: ${req.subject}`,
    `Periode: ${req.startWeek} tot de evaluatie in ${req.evaluatieWeek}`,
    req.goal
      ? `Kwaliteitsdoel van het bestuur (${req.goal.code}): ${req.goal.title}${req.goal.norm ? `. Norm: "${req.goal.norm}"` : ""} (bron: ${req.goal.source})`
      : "Kwaliteitsdoel: geen gekoppeld",
    "",
    "Groepsreflecties van de leerkracht (nieuwste eerst):",
    describeReflections(req.reflections),
    "",
    "Schrijf de groepsanalyse en per cluster de doelen en de aanpak.",
  ].join("\n");
  return { system, user };
}

export function buildEvaluationPrompt(
  req: ClusterRequest,
  plan: { analyse: string | null; doelen: { intensief: string | null; basis: string | null; verrijking: string | null } }
): { system: string; user: string } {
  const system = [
    "Je bent een ervaren intern begeleider en schrijft een CONCEPT-evaluatie van een clusterplan, als voorbereiding op het gesprek tussen leerkracht en IB.",
    "Vat samen wat de groepsreflecties in de looptijd laten zien, per cluster, vergeleken met de doelen.",
    "Het oordeel of de aanpak is uitgevoerd, of die effect had en het vervolgbesluit (voortzetten, aanpassen, intensiveren of afronden) neemt een MENS; doe daar geen uitspraak over.",
    "",
    RULES,
  ].join("\n");
  const user = [
    `Groep: ${req.grades.join("/")} · Vak: ${req.subject} · Periode: ${req.startWeek} tot ${req.evaluatieWeek}`,
    "",
    `Analyse bij de start: ${plan.analyse ?? "niet ingevuld"}`,
    `Doel intensief: ${plan.doelen.intensief ?? "niet ingevuld"}`,
    `Doel basis: ${plan.doelen.basis ?? "niet ingevuld"}`,
    `Doel verrijking: ${plan.doelen.verrijking ?? "niet ingevuld"}`,
    "",
    "Groepsreflecties in de looptijd (nieuwste eerst):",
    describeReflections(req.reflections),
  ].join("\n");
  return { system, user };
}

export type ClusterDraftResult = {
  analyse: string;
  intensiefDoel: string;
  intensiefAanpak: string;
  basisDoel: string;
  basisAanpak: string;
  verrijkingDoel: string;
  verrijkingAanpak: string;
};

/** Oefenmodus: vaste opbouw uit de reflecties (herleidbaar), plus een korte feitelijke analyse. */
function practiceDraft(req: ClusterRequest): ClusterDraftResult {
  const base = draftClusterPlan(req.subject, req.reflections, req.goal?.title);
  const weeks = req.reflections.map((r) => weekNo(r.periode)).join(", ");
  const analyse =
    req.reflections.length === 0
      ? "Nog geen groepsreflecties op dit vak. Beginsituatie: bewijs ontbreekt; vul aan vanuit toetsgegevens en observaties. (oefenmodus)"
      : `Gebaseerd op ${req.reflections.length} groepsreflectie(s) (${weeks}). Toetsgegevens (Cito M/E): bewijs ontbreekt, nog aan te vullen. (oefenmodus)`;
  return { analyse, ...base };
}

export async function generateClusterDraft(
  req: ClusterRequest,
  provider: AiProvider
): Promise<{ draft: ClusterDraftResult; source: string; usage?: TokenUsage }> {
  if (provider.name === "Oefenmodus") return { draft: practiceDraft(req), source: "Oefenmodus" };
  const { output, usage } = await provider.structured(ClusterDraftSchema, buildClusterPrompt(req));
  return {
    draft: {
      analyse: clip(output.analyse),
      intensiefDoel: clip(output.intensief.doel),
      intensiefAanpak: clip(output.intensief.aanpak),
      basisDoel: clip(output.basis.doel),
      basisAanpak: clip(output.basis.aanpak),
      verrijkingDoel: clip(output.verrijking.doel),
      verrijkingAanpak: clip(output.verrijking.aanpak),
    },
    source: `${provider.name} (${provider.model})`,
    usage,
  };
}

export async function generateClusterEvaluation(
  req: ClusterRequest,
  plan: Parameters<typeof buildEvaluationPrompt>[1],
  provider: AiProvider
): Promise<{ text: string; source: string; usage?: TokenUsage }> {
  if (provider.name === "Oefenmodus") {
    const lines = req.reflections.map((r) => `- ${weekNo(r.periode)}: ${r.aandacht ?? r.goed ?? "geen toelichting"}`);
    const text =
      req.reflections.length === 0
        ? "Geen groepsreflecties in de looptijd: bewijs ontbreekt. (oefenmodus)"
        : `Wat de reflecties in de looptijd laten zien:\n${lines.join("\n")}\n(oefenmodus)`;
    return { text: clip(text), source: "Oefenmodus" };
  }
  const { output, usage } = await provider.structured(ClusterEvaluationSchema, buildEvaluationPrompt(req, plan));
  const vragen = output.vragen.filter((v) => v.trim()).slice(0, 3);
  const text = vragen.length > 0 ? `${output.evaluatie.trim()}\n\nVragen voor het gesprek:\n${vragen.map((v) => `- ${v.trim()}`).join("\n")}` : output.evaluatie;
  return { text: clip(text), source: `${provider.name} (${provider.model})`, usage };
}
