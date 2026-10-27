// Oefenmodus: een voorspelbaar voorbeeldvoorstel zonder echte AI.
// Bedoeld om de hele flow (privacycontrole, voorstel, opslaan, aanpassen) te
// testen zolang er geen API-sleutel is. Nooit gebruikt in productie.

import { fromMinutes, toMinutes } from "../../schedule-items";
import type { AiProvider, DraftRequest, LessonDraft } from "../types";
import type { LessonPackage } from "../lesson";

const KLEUTER = ["Leerkring taal", "Spelen en werken", "Leerkring rekenen", "Spel en beweging"];
const MIDDEN = ["Rekenen", "Taal", "Spelling", "Begrijpend lezen", "Wereldoriëntatie", "Engels", "Expressie"];

export const mockProvider: AiProvider = {
  name: "Oefenmodus",
  model: "geen (voorbeeldlessen)",
  async generate(req: DraftRequest): Promise<{ lessons: LessonDraft[] }> {
    const subjects = req.grades.some((g) => g <= 2) ? KLEUTER : MIDDEN;
    const lessons: LessonDraft[] = [];
    let i = 0;
    for (const day of req.days) {
      for (const block of day.free) {
        let cursor = toMinutes(block.start);
        const end = toMinutes(block.end);
        while (end - cursor >= 20) {
          const length = Math.min(45, end - cursor);
          const subject = subjects[i++ % subjects.length];
          const thema = req.thema ? ` rond het thema ${req.thema}` : "";
          lessons.push({
            dag: day.weekday,
            start: fromMinutes(cursor),
            end: fromMinutes(cursor + length),
            subject,
            goalBasis: `Ik kan het lesdoel van ${subject.toLowerCase()}${thema} zelfstandig toepassen. (voorbeeld)`,
            goalVerlengd: "Extra uitleg aan de instructietafel en begeleide inoefening. (voorbeeld)",
            goalVerrijking: "Verdiepende opdracht met meer uitdaging. (voorbeeld)",
          });
          cursor += length;
        }
      }
    }
    return { lessons };
  },
  async lessonPackage(): Promise<{ pkg: LessonPackage }> {
    const n = (niveau: "intensief" | "basis" | "verrijking") => [
      { niveau, opdracht: `Voorbeeldopdracht 1 (${niveau})`, antwoord: "voorbeeld" },
      { niveau, opdracht: `Voorbeeldopdracht 2 (${niveau})`, antwoord: "voorbeeld" },
    ];
    return {
      pkg: {
        titel: "Voorbeeldles (oefenmodus)",
        lesdoel: "Ik kan het lesdoel toepassen. (voorbeeld)",
        succescriteria: ["Het is gelukt als ik de opdracht zelfstandig kan maken. (voorbeeld)"],
        voorkennis: "Korte herhaling van de vorige les. (voorbeeld)",
        instructie: [
          { fase: "Ik doe het voor", uitleg: "Voorbeeld." },
          { fase: "We doen het samen", uitleg: "Voorbeeld." },
          { fase: "Jij doet het zelf", uitleg: "Voorbeeld." },
        ],
        controleVanBegrip: [1, 2, 3].map((i) => ({ vraag: `Vraag ${i} (voorbeeld)`, verwachtAntwoord: "voorbeeld" })),
        intensief: { aanpak: "Instructietafel. (voorbeeld)", opdracht: "Begeleide inoefening. (voorbeeld)" },
        basis: { aanpak: "Zelfstandig verwerken. (voorbeeld)", opdracht: "Basisopdracht. (voorbeeld)" },
        verrijking: { aanpak: "Verkorte instructie. (voorbeeld)", opdracht: "Verdiepende opdracht. (voorbeeld)" },
        werkblad: [...n("intensief"), ...n("basis"), ...n("verrijking")],
        visueelMateriaal: ["Een eenvoudig schema bij het lesdoel. (voorbeeld)"],
        afsluiting: "Terugkijken op het lesdoel. (voorbeeld)",
        materialen: ["wisbordjes"],
        tijdsindeling: [
          { onderdeel: "Start en voorkennis", minuten: 5 },
          { onderdeel: "Instructie en begeleide inoefening", minuten: 15 },
          { onderdeel: "Zelfstandige verwerking", minuten: 10 },
        ],
      },
    };
  },
  async structured() {
    // Niet gebruikt: de motor (lib/ai/cluster.ts) maakt in oefenmodus een vaste opbouw.
    throw new Error("Oefenmodus ondersteunt geen vrije gestructureerde uitvoer.");
  },
};
