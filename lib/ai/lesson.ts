// Lespakket: groep + vak + leerdoel -> complete EDI-lesvoorbereiding.
// Zelfde motor-principe als de weekplanning: de prompt (didactiek, spelregels)
// is universeel, de aanbieder levert alleen de uitkomst. Altijd een CONCEPT
// dat de leerkracht controleert en aanpast. Geen leerlinggegevens in het verzoek.
// Visueel materiaal: alleen BESCHRIJVINGEN (beeldgeneratie is een aparte keuze).

import { z } from "zod";

export type LessonRequest = {
  grades: number[];
  subject: string;
  learningGoal: string; // door de leerkracht gekozen leerdoel, vooraf door de privacycontrole
  method: string | null; // methode bij naam, geen methodeteksten
  minutes: number;
  focus: string | null; // aandachtspunt op groepsniveau (bijv. uit groepsresultaten of reflectie)
};

const Niveau = z.object({
  aanpak: z.string().describe("Wat de leerkracht met dit cluster doet, concreet"),
  opdracht: z.string().describe("Opdracht voor de leerlingen in dit cluster"),
});

export const LessonPackageSchema = z.object({
  titel: z.string(),
  lesdoel: z.string().describe("Concreet lesdoel, begint met 'Ik kan ...'"),
  succescriteria: z.array(z.string()).describe("2 tot 4 criteria: 'Het is gelukt als ...'"),
  voorkennis: z.string().describe("Hoe de leerkracht voorkennis activeert (2 tot 4 minuten)"),
  instructie: z
    .array(z.object({ fase: z.string().describe("Ik doe het voor / We doen het samen / Jullie doen het samen / Jij doet het zelf"), uitleg: z.string() }))
    .describe("Stapsgewijze instructie volgens EDI en het GRRIM-model"),
  controleVanBegrip: z
    .array(z.object({ vraag: z.string(), verwachtAntwoord: z.string() }))
    .describe("3 tot 5 vragen voor wisbordjes of willekeurige beurten"),
  intensief: Niveau.describe("Verlengde instructie aan de instructietafel"),
  basis: Niveau,
  verrijking: Niveau.describe("Verkorte instructie en verdieping"),
  werkblad: z
    .array(z.object({ niveau: z.enum(["intensief", "basis", "verrijking"]), opdracht: z.string(), antwoord: z.string() }))
    .describe("Minstens 2 opdrachten per niveau, met antwoord"),
  visueelMateriaal: z.array(z.string()).describe("1 tot 3 beschrijvingen van passende plaatjes of schema's (geen afbeeldingen maken)"),
  afsluiting: z.string().describe("Terugkijken op het lesdoel"),
  materialen: z.array(z.string()),
});
export type LessonPackage = z.infer<typeof LessonPackageSchema>;

export function buildLessonPrompt(req: LessonRequest): { system: string; user: string } {
  const isKleuter = req.grades.some((g) => g <= 2);
  const system = [
    "Je bent een ervaren Nederlandse basisschoolleerkracht en maakt voor een collega een CONCEPT-lesvoorbereiding.",
    "De leerkracht controleert en past aan; jouw werk moet direct bruikbaar zijn zonder dat zij alles opnieuw schrijft.",
    "",
    "Didactiek:",
    "- Expliciete Directe Instructie (EDI): concreet lesdoel ('Ik kan ...'), voorkennis activeren, stapsgewijze instructie, actieve leerlingen, controle van begrip met wisbordjes of willekeurige beurten, beslissingen op basis daarvan, duidelijke afsluiting.",
    "- GRRIM: verantwoordelijkheid geleidelijk van leerkracht naar leerling (Ik doe het voor, We doen het samen, Jullie doen het samen, Jij doet het zelf).",
    "- Drie niveaus op groepsniveau: intensief (verlengde instructie aan de instructietafel), basis, verrijking (verkorte instructie, verdieping).",
    isKleuter
      ? "- Groep 1-2: spelend leren, korte kringactiviteit, hoeken en concreet materiaal. Geen werkbladen met veel tekst; het 'werkblad' mag een speel- of doe-opdracht zijn."
      : "- Groep 3-8: concreet naar abstract; laat de leerling hardop denken waar het helpt.",
    "",
    "Spelregels:",
    "- Gebruik nooit namen van leerlingen of andere persoonsgegevens; schrijf over 'de groep' of 'een groepje'.",
    "- Noem een methode alleen bij naam; neem geen teksten of opdrachten uit methodes over.",
    "- Inhoud moet kloppen: controleer rekensommen en antwoorden.",
    "- Visueel materiaal: beschrijf alleen wat er op een plaatje of schema moet staan.",
    "- Helder, eenvoudig Nederlands.",
  ].join("\n");
  const user = [
    `Groep: ${req.grades.join("/")}`,
    `Vak: ${req.subject}`,
    `Leerdoel: ${req.learningGoal}`,
    `Methode: ${req.method ?? "geen"}`,
    `Lesduur: ${req.minutes} minuten`,
    `Aandachtspunt van de groep: ${req.focus ?? "geen"}`,
    "",
    "Maak de complete lesvoorbereiding.",
  ].join("\n");
  return { system, user };
}

/** Eenvoudige controles op de uitkomst; geeft opmerkingen terug (leeg = in orde). */
export function checkLessonPackage(pkg: LessonPackage): string[] {
  const notes: string[] = [];
  if (!/^ik kan\b/i.test(pkg.lesdoel.trim())) notes.push("Lesdoel begint niet met 'Ik kan'.");
  if (pkg.controleVanBegrip.length < 3) notes.push("Minder dan 3 vragen voor controle van begrip.");
  for (const n of ["intensief", "basis", "verrijking"] as const) {
    if (pkg.werkblad.filter((w) => w.niveau === n).length < 2) notes.push(`Werkblad: minder dan 2 opdrachten voor ${n}.`);
  }
  if (pkg.instructie.length < 3) notes.push("Instructie heeft minder dan 3 stappen.");
  return notes;
}

export function renderLessonMarkdown(title: string, req: LessonRequest, letter: string, pkg: LessonPackage, notes: string[]): string {
  const l: string[] = [
    `# ${title}: uitkomst ${letter}`,
    "",
    `Groep ${req.grades.join("/")} · ${req.subject} · ${req.minutes} min · leerdoel gevraagd: ${req.learningGoal}`,
    `Controle: ${notes.length === 0 ? "in orde" : notes.join(" ")}`,
    "",
    `## ${pkg.titel}`,
    "",
    `**Lesdoel:** ${pkg.lesdoel}`,
    "",
    "**Succescriteria**",
    ...pkg.succescriteria.map((s) => `- ${s}`),
    "",
    `**Voorkennis activeren:** ${pkg.voorkennis}`,
    "",
    "**Instructie**",
    ...pkg.instructie.map((s, i) => `${i + 1}. *${s.fase}:* ${s.uitleg}`),
    "",
    "**Controle van begrip**",
    ...pkg.controleVanBegrip.map((c) => `- ${c.vraag} (verwacht: ${c.verwachtAntwoord})`),
    "",
    "**Differentiatie**",
    `- Intensief: ${pkg.intensief.aanpak} Opdracht: ${pkg.intensief.opdracht}`,
    `- Basis: ${pkg.basis.aanpak} Opdracht: ${pkg.basis.opdracht}`,
    `- Verrijking: ${pkg.verrijking.aanpak} Opdracht: ${pkg.verrijking.opdracht}`,
    "",
    "**Werkblad**",
    ...pkg.werkblad.map((w) => `- [${w.niveau}] ${w.opdracht} (antwoord: ${w.antwoord})`),
    "",
    "**Visueel materiaal (beschrijving)**",
    ...pkg.visueelMateriaal.map((v) => `- ${v}`),
    "",
    `**Afsluiting:** ${pkg.afsluiting}`,
    "",
    `**Materialen:** ${pkg.materialen.join(", ")}`,
    "",
  ];
  return l.join("\n");
}
