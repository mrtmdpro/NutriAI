import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { requireServerEnv } from "@/lib/env/server";

/**
 * Bilingual translation pipeline.
 *
 * Given a source text in either English or Vietnamese, produces both
 * translations grounded on the source. We use a structured output
 * schema so the model can't drift into commentary.
 *
 * Used by the ETL workers to fill in the missing `*_vn` / `*_en`
 * columns on ingested data. Cost is amortized across many rows
 * because we generally translate short summaries (200-400 tokens).
 */
export const TRANSLATION_MODEL = "openai/gpt-4o-mini";

const translationSchema = z.object({
  vn: z
    .string()
    .min(1, "Vietnamese translation must not be empty")
    .describe("Vietnamese translation of the source. Plain prose, no markdown."),
  en: z
    .string()
    .min(1, "English translation must not be empty")
    .describe("English translation of the source. Plain prose, no markdown."),
});

export type Bilingual = z.infer<typeof translationSchema>;

export async function translateBoth(
  source: string,
  contextHint?: string
): Promise<Bilingual> {
  requireServerEnv("AI_GATEWAY_API_KEY");

  const system = [
    "You translate scientific nutrition content between Vietnamese and English.",
    "Preserve technical accuracy: ingredient names, dosages, and units stay verbatim.",
    "Use neutral, clinical-but-friendly tone. No marketing language.",
    "Never add facts that aren't in the source.",
    contextHint ? `Context: ${contextHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { object } = await generateObject({
    model: TRANSLATION_MODEL,
    schema: translationSchema,
    system,
    prompt: `Source text:\n${source}`,
    // Translations should not exceed ~2x the source length. 800 covers
    // a 200-token abstract comfortably and caps cost on adversarial
    // / malformed inputs.
    maxOutputTokens: 800,
  });
  return object;
}
