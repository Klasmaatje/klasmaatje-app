// Gemini via de Vercel AI SDK. Sleutel en model komen uit omgevingsvariabelen,
// nooit uit de database:
//   GOOGLE_GENERATIVE_AI_API_KEY  (betaalde tier, account op naam van Klasmaatje)
//   GEMINI_MODEL                  (optioneel, standaard hieronder)
// Productie later via Google Cloud met EU-endpoint en verwerkersafspraken.

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { DraftResponseSchema, type AiProvider } from "../types";

const DEFAULT_MODEL = "gemini-2.5-flash";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export const geminiProvider: AiProvider = {
  name: "Gemini",
  async generate(_req, prompt) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
    const { output } = await generateText({
      model: google(process.env.GEMINI_MODEL || DEFAULT_MODEL),
      system: prompt.system,
      prompt: prompt.user,
      output: Output.object({ schema: DraftResponseSchema }),
      temperature: 0.4,
    });
    return output.lessons;
  },
};
