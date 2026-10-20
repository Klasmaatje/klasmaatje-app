// Gedeelde types voor de AI-laag. De "universele motor" (prompt, EDI, drie
// niveaus, privacy, controle van de uitkomst) staat los van de aanbieder;
// een aanbieder (Gemini, later Azure OpenAI, Mistral, ...) zet alleen een
// verzoek om in lessen.

import { z } from "zod";

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

export type AiProvider = {
  name: string; // voor de leerkracht: "Gemini" of "Oefenmodus"
  generate(request: DraftRequest, prompt: { system: string; user: string }): Promise<LessonDraft[]>;
};
