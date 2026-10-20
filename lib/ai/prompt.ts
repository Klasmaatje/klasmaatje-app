// De prompt van de universele motor: didactiek en spelregels die voor elk
// bestuur gelden. Bestuursspecifieke normen (ambitiekaarten, kwaliteitskaarten)
// komen hier later als extra context bij.

import type { DraftRequest } from "./types";

export function buildPrompt(req: DraftRequest): { system: string; user: string } {
  const isKleuter = req.grades.some((g) => g <= 2);

  const system = [
    "Je bent een ervaren Nederlandse basisschoolleerkracht en helpt een collega met een CONCEPT-weekplanning.",
    "De leerkracht beslist; jouw voorstel is altijd een concept dat zij aanpast.",
    "",
    "Didactiek:",
    "- Werk volgens Expliciete Directe Instructie (EDI): elk lesdoel is concreet en begint met 'Ik kan ...'.",
    "- Differentieer op drie niveaus: basis, verlengde instructie (extra uitleg en begeleide inoefening) en verrijking (verdieping, meer uitdaging).",
    isKleuter
      ? "- Dit is een kleutergroep: spelend leren, kringactiviteiten, leerkring taal en rekenen, spelen en werken in hoeken, bewegen. Korte activiteiten. Geen methodelessen zoals bij groep 3-8."
      : "- Groep 3-8: plan elke dag rekenen en taal of spelling, en lezen. Verdeel wereldoriëntatie, burgerschap, Engels, expressie en sociaal-emotioneel leren over de week.",
    "",
    "Spelregels:",
    "- Plan ALLEEN binnen de opgegeven vrije blokken. Vaste momenten (gebed, pauzes, kring) en al ingeplande lessen blijven staan.",
    "- Een les duurt 20 tot 60 minuten; vul een vrij blok met een of meer lessen die elkaar niet overlappen.",
    "- Gebruik nooit namen van leerlingen of andere persoonsgegevens.",
    "- Noem methodes alleen bij naam; neem geen teksten of opdrachten uit methodes over.",
    "- Schrijf in eenvoudig, helder Nederlands. Houd doelen kort (maximaal 25 woorden).",
  ].join("\n");

  const methods = req.methods.length
    ? req.methods.map((m) => `${m.name} (${m.subject})`).join(", ")
    : "geen opgegeven";

  const days = req.days
    .map((d) => {
      const fixed = d.fixed.map((f) => `${f.time} ${f.label}`).join("; ") || "geen";
      const free = d.free.map((b) => `${b.start}-${b.end}`).join(", ") || "geen vrije tijd";
      return `${d.label} (dag ${d.weekday}, ${d.startTime}-${d.endTime})\n  Vast: ${fixed}\n  Vrije blokken: ${free}`;
    })
    .join("\n");

  const user = [
    `Groep ${req.groupName} (leerjaar ${req.grades.join(" en ")}), ${req.weekLabel}.`,
    `Thema van de week: ${req.thema || "geen"}.`,
    `Bijzonderheden: ${req.bijzonderheden || "geen"}.`,
    `Methodes van de school: ${methods}.`,
    "",
    "Dagen:",
    days,
    "",
    "Maak voor de vrije blokken een voorstel voor lessen. Geef per les: dag (zoals MONDAY), begin- en eindtijd (HH:MM), vak, en de doelen voor basis, verlengde instructie en verrijking.",
  ].join("\n");

  return { system, user };
}
