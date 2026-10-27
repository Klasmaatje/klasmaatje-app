// Ingang van de AI-laag: één functie, los van de aanbieder.
// Kiest de aanbieder uit de bestuursinstellingen (SchoolConfig.aiProvider),
// bouwt de prompt, en controleert de uitkomst voordat er iets wordt opgeslagen.
// De privacycontrole op vrije tekst gebeurt VOORDAT deze functie wordt
// aangeroepen (zie de server action), zodat er nooit ongecontroleerde tekst
// naar een aanbieder gaat.

import { buildPrompt } from "./prompt";
import { fitsInBlocks, overlaps } from "./free-blocks";
import { geminiConfigured, geminiProvider } from "./providers/gemini";
import { openaiConfigured, openaiProvider } from "./providers/openai";
import { anthropicConfigured, anthropicProvider } from "./providers/anthropic";
import { mockProvider } from "./providers/mock";
import type { AiProvider, DraftRequest, LessonDraft, TokenUsage } from "./types";
import { buildLessonPrompt, checkLessonPackage, type LessonPackage, type LessonRequest } from "./lesson";

export class AiNotConfiguredError extends Error {}

/** Aanbieders die met een sleutel in de omgeving beschikbaar zijn. */
export const PROVIDERS: Record<string, { provider: AiProvider; configured: () => boolean }> = {
  openai: { provider: openaiProvider, configured: openaiConfigured },
  anthropic: { provider: anthropicProvider, configured: anthropicConfigured },
  gemini: { provider: geminiProvider, configured: geminiConfigured },
};

/**
 * Welke aanbieder voor dit bestuur (SchoolConfig.aiProvider: "openai" | "anthropic" | "gemini")?
 * Zonder sleutel voor die aanbieder: oefenmodus (alleen buiten productie of met AI_MOCK=1).
 */
export function pickProvider(configured: string | null | undefined): AiProvider {
  const entry = PROVIDERS[configured ?? "gemini"];
  if (entry && entry.configured()) return entry.provider;
  if (process.env.NODE_ENV !== "production" || process.env.AI_MOCK === "1") return mockProvider;
  throw new AiNotConfiguredError("De AI-koppeling is nog niet ingesteld.");
}

/** Korte uitleg voor de leerkracht welke AI het voorstel maakt. */
export function providerLabel(configured: string | null | undefined): string {
  const entry = PROVIDERS[configured ?? "gemini"];
  if (entry && entry.configured()) return entry.provider.name;
  return "oefenmodus (nog geen AI-sleutel, voorbeeldlessen)";
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
): Promise<{ lessons: LessonDraft[]; skipped: number; provider: string; usage?: TokenUsage }> {
  const { lessons: raw, usage } = await provider.generate(request, buildPrompt(request));

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
  return { lessons: accepted, skipped, provider: provider.name, usage };
}

/** Lespakket laten maken en controleren. De uitkomst is altijd een concept. */
export async function generateLessonPackage(
  request: LessonRequest,
  provider: AiProvider
): Promise<{ pkg: LessonPackage; notes: string[]; provider: string; usage?: TokenUsage }> {
  const { pkg: raw, usage } = await provider.lessonPackage(buildLessonPrompt(request));
  // "CONCEPT - ..." hoort niet in de titel: de app toont zelf dat het een concept is.
  const pkg = { ...raw, titel: raw.titel.replace(/^\s*concept\b\s*[-–—:]?\s*/i, "").trim() || raw.titel };
  return { pkg, notes: checkLessonPackage(pkg, request), provider: provider.name, usage };
}
