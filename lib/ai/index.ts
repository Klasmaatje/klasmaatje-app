// Ingang van de AI-laag: één functie, los van de aanbieder.
// Kiest de aanbieder uit de bestuursinstellingen (SchoolConfig.aiProvider),
// bouwt de prompt, en controleert de uitkomst voordat er iets wordt opgeslagen.
// De privacycontrole op vrije tekst gebeurt VOORDAT deze functie wordt
// aangeroepen (zie de server action), zodat er nooit ongecontroleerde tekst
// naar een aanbieder gaat.

import { buildPrompt } from "./prompt";
import { fitsInBlocks, overlaps } from "./free-blocks";
import { geminiConfigured, geminiProvider } from "./providers/gemini";
import { mockProvider } from "./providers/mock";
import type { AiProvider, DraftRequest, LessonDraft } from "./types";

export class AiNotConfiguredError extends Error {}

/** Welke aanbieder voor dit bestuur? Zonder sleutel: oefenmodus (alleen buiten productie). */
export function pickProvider(configured: string | null | undefined): AiProvider {
  if ((configured ?? "gemini") === "gemini" && geminiConfigured()) return geminiProvider;
  if (process.env.NODE_ENV !== "production" || process.env.AI_MOCK === "1") return mockProvider;
  throw new AiNotConfiguredError("De AI-koppeling is nog niet ingesteld.");
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Vraagt een voorstel en houdt alleen lessen over die passen: geldige dag en
 * tijden, binnen een vrij blok, niet overlappend met elkaar. Teksten worden
 * ingekort tot redelijke lengtes.
 */
export async function generateWeekPlanDraft(
  request: DraftRequest,
  provider: AiProvider
): Promise<{ lessons: LessonDraft[]; skipped: number; provider: string }> {
  const raw = await provider.generate(request, buildPrompt(request));

  const accepted: LessonDraft[] = [];
  let skipped = 0;
  for (const l of raw) {
    const day = request.days.find((d) => d.weekday === l.dag);
    const slot = { start: l.start, end: l.end };
    const valid =
      day &&
      TIME.test(l.start) &&
      TIME.test(l.end) &&
      fitsInBlocks(slot, day.free) &&
      !accepted.some((a) => a.dag === l.dag && overlaps(a, slot)) &&
      l.subject.trim().length > 0;
    if (!valid) {
      skipped++;
      continue;
    }
    accepted.push({
      dag: l.dag,
      start: l.start,
      end: l.end,
      subject: l.subject.trim().slice(0, 80),
      goalBasis: l.goalBasis.trim().slice(0, 500),
      goalVerlengd: l.goalVerlengd.trim().slice(0, 500),
      goalVerrijking: l.goalVerrijking.trim().slice(0, 500),
    });
  }
  return { lessons: accepted, skipped, provider: provider.name };
}
