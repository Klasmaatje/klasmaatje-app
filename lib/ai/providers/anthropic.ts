// Claude (Anthropic) via de Vercel AI SDK. Sleutel en model komen uit
// omgevingsvariabelen, nooit uit de database:
//   ANTHROPIC_API_KEY  (account op naam van Klasmaatje)
//   ANTHROPIC_MODEL    (optioneel, standaard hieronder; middenklasse voor een eerlijke vergelijking)
// Let op: de directe Anthropic API heeft geen EU-regio. Productie in de EU kan
// via AWS Bedrock of Google Vertex AI; dat wordt apart beoordeeld (DPIA).

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { DraftResponseSchema, type AiProvider } from "../types";
import { LessonPackageSchema } from "../lesson";

const DEFAULT_MODEL = "claude-sonnet-5-5";

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const anthropicProvider: AiProvider = {
  name: "Claude",
  model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
  async generate(_req, prompt) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { output, usage } = await generateText({
      model: anthropic(process.env.ANTHROPIC_MODEL || DEFAULT_MODEL),
      system: prompt.system,
      prompt: prompt.user,
      output: Output.object({ schema: DraftResponseSchema }),
      maxOutputTokens: 8000,
    });
    return { lessons: output.lessons, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } };
  },
  async lessonPackage(prompt) {
    const client = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { output, usage } = await generateText({
      model: client(process.env.ANTHROPIC_MODEL || DEFAULT_MODEL),
      system: prompt.system,
      prompt: prompt.user,
      output: Output.object({ schema: LessonPackageSchema }),
      maxOutputTokens: 8000,
    });
    return { pkg: output, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } };
  },
};
