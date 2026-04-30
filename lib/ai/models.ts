import "server-only";
import { openai } from "@ai-sdk/openai";

/**
 * Pick the right model handle based on which provider key is present.
 *
 * Preference order:
 *   1. AI_GATEWAY_API_KEY → use Vercel AI Gateway via the bare
 *      `"openai/<model>"` string format. Adds observability + provider
 *      failover; requires a credit card on the Vercel team.
 *   2. OPENAI_API_KEY → use OpenAI directly via `@ai-sdk/openai`.
 *      Same model behavior, no Vercel Gateway in front.
 *
 * If neither is set, callers throw at runtime — we deliberately don't
 * validate at module load so the rest of the app boots without AI.
 */

function gatewayConfigured(): boolean {
  const key = process.env.AI_GATEWAY_API_KEY;
  return typeof key === "string" && key.length > 0;
}

export function chatModel(modelId = "gpt-4o-mini") {
  if (gatewayConfigured()) return `openai/${modelId}` as const;
  return openai(modelId);
}

export function embeddingModel(modelId = "text-embedding-3-small") {
  if (gatewayConfigured()) return `openai/${modelId}` as const;
  return openai.embedding(modelId);
}

/** Embedding dimension for text-embedding-3-small. Pinned to match `vector(1536)`. */
export const EMBEDDING_DIM = 1536;
