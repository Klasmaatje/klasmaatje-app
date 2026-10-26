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
  tijdsindeling: z
    .array(z.object({ onderdeel: z.string(), minuten: z.number().describe("Hele minuten") }))
    .describe("Alle onderdelen van de les in volgorde; de minuten tellen EXACT op tot de lesduur"),
  materialen: z.array(z.string()),
});
export type LessonPackage = z.infer<typeof LessonPackageSchema>;

export function buildLessonPrompt(req: LessonRequest): { system: string; user: string } {
  const isKleuter = req.grades.some((g) => g <= 2);
  const isRekenen = /reken/i.test(req.subject);
  const system = [
    "Je bent een ervaren Nederlandse basisschoolleerkracht en maakt voor een collega een CONCEPT-lesvoorbereiding.",
    "De leerkracht controleert en past aan; jouw werk moet direct bruikbaar zijn zonder dat zij alles opnieuw schrijft.",
    "",
    "Didactiek:",
    "- Expliciete Directe Instructie (EDI): concreet lesdoel ('Ik kan ...'), voorkennis activeren, stapsgewijze instructie, actieve leerlingen, controle van begrip met wisbordjes of willekeurige beurten, beslissingen op basis daarvan, duidelijke afsluiting.",
    "- GRRIM: verantwoordelijkheid geleidelijk van leerkracht naar leerling (Ik doe het voor, We doen het samen, Jullie doen het samen, Jij doet het zelf).",
    "- Drie niveaus op groepsniveau: intensief (verlengde instructie aan de instructietafel), basis, verrijking (verkorte instructie, verdieping).",
    isKleuter
      ? [
          "- Groep 1-2: thematisch en spelend leren, korte kringactiviteit, hoeken en concreet materiaal. Geen werkbladen met veel tekst; het 'werkblad' mag een speel- of doe-opdracht zijn.",
          "- Bij kleuters heten de drie niveaus weer, basis en meer: 'intensief' is het weergroepje (kleiner doel, herhalen, bijvoorbeeld tot 5 tellen), 'basis' het basisdoel, 'verrijking' het meergroepje (groter doel, bijvoorbeeld tot 15 of 20 tellen). Gebruik die woorden in de tekst.",
        ].join("\n")
      : "- Groep 3-8: van concreet (materiaal) via representatie (plaatje, schema) naar abstract (getallen en symbolen), zonder te lang in het concrete te blijven; laat de leerling hardop denken waar het helpt.",
    isRekenen && !isKleuter
      ? "- Rekenles volgens de vaste opbouw van de school: 1. automatiseren (alle leerlingen actief, minstens 20 sommen, passend bij eerdere lesstof), 2. start (lesoverzicht, voorkennis, lesdoel met concept en vaardigheid op het bord), 3. instructie 'ik doe het' (sterke rekenaars doen verkort mee, leerlingen schrijven mee), 4. begeleide inoefening 'wij doen het, jullie doen het' met controle van begrip, 5. kleine lesafsluiting (een voorbeeld op het wisbordje, besluit: meer voorbeelden of zelfstandig verder), 6. zelfstandige verwerking (opdrachten op het bord, tijd, geluidsniveau, wat te doen als je klaar bent, hulpronde, verlengde instructie aan de instructietafel), 7. grote lesafsluiting (samenvatting, terug naar het lesdoel, vooruitblik)."
      : "",
    isKleuter
      ? ""
      : "- Verlengde instructie (intensief) is betere instructie en meer leertijd voor hetzelfde doel, geen lager doel. Verrijking is open, complexer en vraagt nadenken over de aanpak.",
    "",
    "Spelregels:",
    "- Gebruik nooit namen van leerlingen of andere persoonsgegevens; schrijf over 'de groep' of 'een groepje'.",
    "- Noem een methode alleen bij naam; neem geen teksten of opdrachten uit methodes over.",
    "- Inhoud moet kloppen: controleer rekensommen en antwoorden.",
    "- Visueel materiaal: beschrijf alleen wat er op een plaatje of schema moet staan.",
    "- Tijdsindeling: alle onderdelen in volgorde met hele minuten; samen precies de lesduur.",
    "- Schrijf beknopt: een leerkracht moet het pakket in ongeveer 5 minuten kunnen doornemen. Uitgebreider is niet beter.",
    "- Helder, eenvoudig Nederlands.",
    "",
    "Controleer voordat je antwoordt:",
    "- Past elke opdracht bij het lesdoel en het niveau?",
    "- Toetst een opdracht over een misvatting die misvatting ook echt? (Voorbeeld: wie wil laten zien dat 'een grotere noemer betekent een grotere breuk' niet klopt, gebruikt breuken met VERSCHILLENDE noemers.)",
    "- Kloppen alle antwoorden en sommen?",
    "- Telt de tijdsindeling op tot de lesduur?",
  ].filter(Boolean).join("\n");
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
export function checkLessonPackage(pkg: LessonPackage, req?: LessonRequest): string[] {
  const notes: string[] = [];
  if (req) {
    const total = pkg.tijdsindeling.reduce((sum, t) => sum + t.minuten, 0);
    if (total !== req.minutes) notes.push(`Tijdsindeling telt op tot ${total} minuten in plaats van ${req.minutes}.`);
  }
  if (!/^ik kan\b/i.test(pkg.lesdoel.trim())) notes.push("Lesdoel begint niet met 'Ik kan'.");
  if (pkg.controleVanBegrip.length < 3) notes.push("Minder dan 3 vragen voor controle van begrip.");
  for (const n of ["intensief", "basis", "verrijking"] as const) {
    if (pkg.werkblad.filter((w) => w.niveau === n).length < 2) notes.push(`Werkblad: minder dan 2 opdrachten voor ${n}.`);
  }
  if (pkg.instructie.length < 3) notes.push("Instructie heeft minder dan 3 stappen.");
  return notes;
}

export function renderLessonMarkdown(title: string, req: LessonRequest, letter: string, pkg: LessonPackage, notes: string[]): string {
  const kleuter = req.grades.some((g) => g <= 2);
  const lab = kleuter
    ? { intensief: "Weergroepje", basis: "Basis", verrijking: "Meergroepje" }
    : { intensief: "Intensief", basis: "Basis", verrijking: "Verrijking" };
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
    `- ${lab.intensief}: ${pkg.intensief.aanpak} Opdracht: ${pkg.intensief.opdracht}`,
    `- ${lab.basis}: ${pkg.basis.aanpak} Opdracht: ${pkg.basis.opdracht}`,
    `- ${lab.verrijking}: ${pkg.verrijking.aanpak} Opdracht: ${pkg.verrijking.opdracht}`,
    "",
    "**Werkblad**",
    ...pkg.werkblad.map((w) => `- [${lab[w.niveau]}] ${w.opdracht} (antwoord: ${w.antwoord})`),
    "",
    "**Visueel materiaal (beschrijving)**",
    ...pkg.visueelMateriaal.map((v) => `- ${v}`),
    "",
    `**Afsluiting:** ${pkg.afsluiting}`,
    "",
    `**Materialen:** ${pkg.materialen.join(", ")}`,
    "",
    "**Tijdsindeling**",
    ...pkg.tijdsindeling.map((t) => `- ${t.onderdeel}: ${t.minuten} min`),
    "",
  ];
  return l.join("\n");
}
