// OpenAI via de Vercel AI SDK. Sleutel en model komen uit omgevingsvariabelen,
// nooit uit de database:
//   OPENAI_API_KEY   (account op naam van Klasmaatje)
//   OPENAI_MODEL     (optioneel, standaard hieronder; middenklasse voor een eerlijke vergelijking)
// Productieroute (EU-dataresidency of Azure) wordt apart beoordeeld (DPIA).

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { DraftResponseSchema, maxOutputTokens, type AiProvider } from "../types";
import { LessonPackageSchema } from "../lesson";

const DEFAULT_MODEL = "gpt-6.1-sol";

export function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export const openaiProvider: AiProvider = {
  name: "OpenAI",
  model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
  async generate(_req, prompt) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { output, usage } = await generateText({
      model: openai(process.env.OPENAI_MODEL || DEFAULT_MODEL),
      system: prompt.system,
      prompt: prompt.user,
      output: Output.object({ schema: DraftResponseSchema }),
      maxOutputTokens: maxOutputTokens(),
    });
    return { lessons: output.lessons, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } };
  },
  async lessonPackage(prompt) {
    const client = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { output, usage } = await generateText({
      model: client(process.env.OPENAI_MODEL || DEFAULT_MODEL),
      system: prompt.system,
      prompt: prompt.user,
      output: Output.object({ schema: LessonPackageSchema }),
      maxOutputTokens: maxOutputTokens(),
    });
    return { pkg: output, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } };
  },
};
