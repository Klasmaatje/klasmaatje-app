// Oefenmodus: een voorspelbaar voorbeeldvoorstel zonder echte AI.
// Bedoeld om de hele flow (privacycontrole, voorstel, opslaan, aanpassen) te
// testen zolang er geen API-sleutel is. Nooit gebruikt in productie.

import { fromMinutes, toMinutes } from "../../schedule-items";
import type { AiProvider, DraftRequest, LessonDraft } from "../types";

const KLEUTER = ["Leerkring taal", "Spelen en werken", "Leerkring rekenen", "Spel en beweging"];
const MIDDEN = ["Rekenen", "Taal", "Spelling", "Begrijpend lezen", "Wereldoriëntatie", "Engels", "Expressie"];

export const mockProvider: AiProvider = {
  name: "Oefenmodus",
  async generate(req: DraftRequest): Promise<LessonDraft[]> {
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
    return lessons;
  },
};
