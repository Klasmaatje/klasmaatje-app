// Gedeelde types voor de AI-laag. De "universele motor" (prompt, EDI, drie
// niveaus, privacy, controle van de uitkomst) staat los van de aanbieder;
// een aanbieder (OpenAI, Anthropic/Claude, Gemini, oefenmodus) zet alleen een
// verzoek om in lessen.

import { z } from "zod";
import type { LessonPackage } from "./lesson";

export type TimeBlock = { start: string; end: string };

export type DraftDay = {
  weekday: string; // "MONDAY"
  label: string; // "Maandag 26 oktober"
  startTime: string;
  endTime: string;
  fixed: { time: string; label: string }[]; // vaste momenten en al ingeplande lessen
  free: TimeBlock[]; // vrije blokken waarin de AI lessen mag plannen
};

/** Alles wat de AI krijgt. Bevat GEEN leerlinggegevens; vrije tekst is vooraf gecontroleerd. */
export type DraftRequest = {
  groupName: string;
  grades: number[];
  weekLabel: string;
  thema: string | null;
  bijzonderheden: string | null;
  methods: { name: string; subject: string }[];
  days: DraftDay[];
};

export const LessonDraftSchema = z.object({
  dag: z.string().describe("Weekdag in het Engels in hoofdletters, bijvoorbeeld MONDAY"),
  start: z.string().describe("Begintijd HH:MM"),
  end: z.string().describe("Eindtijd HH:MM"),
  subject: z.string().describe("Vak of activiteit, kort"),
  goalBasis: z.string().describe("Lesdoel basisgroep, als 'Ik kan ...'"),
  goalVerlengd: z.string().describe("Doel of aanpak voor de verlengde instructiegroep"),
  goalVerrijking: z.string().describe("Doel of aanpak voor de verrijkingsgroep"),
});
export const DraftResponseSchema = z.object({ lessons: z.array(LessonDraftSchema) });

export type LessonDraft = z.infer<typeof LessonDraftSchema>;

export type TokenUsage = { inputTokens?: number; outputTokens?: number };

export type AiProvider = {
  name: string; // voor de leerkracht: "OpenAI", "Claude", "Gemini" of "Oefenmodus"
  model: string; // modelnaam, voor de vergelijking en het logboek
  generate(
    request: DraftRequest,
    prompt: { system: string; user: string }
  ): Promise<{ lessons: LessonDraft[]; usage?: TokenUsage }>;
  /** Lespakket (groep + vak + leerdoel). Zie lib/ai/lesson.ts. */
  lessonPackage(prompt: { system: string; user: string }): Promise<{ pkg: LessonPackage; usage?: TokenUsage }>;
};

/**
 * Plafond voor de lengte van een AI-antwoord, voor ELKE aanbieder gelijk (eerlijke
 * vergelijking, kosten begrensd). Aan te passen met AI_MAX_OUTPUT_TOKENS in .env.
 */
export function maxOutputTokens(): number {
  const v = Number(process.env.AI_MAX_OUTPUT_TOKENS);
  return Number.isFinite(v) && v > 0 ? v : 16000;
}
