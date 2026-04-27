import "server-only";
import { embed, embedMany } from "ai";
import { embeddingModel, EMBEDDING_DIM } from "@/lib/ai/models";
import { isMissingEnvError } from "@/lib/env/server";

/**
 * Embedding pipeline. Pinned to a 1536-dimension model to match the
 * `vector(1536)` columns. The provider (Gateway vs. direct OpenAI)
 * is decided in lib/ai/models.ts based on which env var is set.
 */
export { EMBEDDING_DIM };

function ensureProviderConfigured(): void {
  if (process.env.AI_GATEWAY_API_KEY) return;
  if (process.env.OPENAI_API_KEY) return;
  throw new Error(
    "Missing required env var: AI_GATEWAY_API_KEY or OPENAI_API_KEY. Set one in .env.local or via 'vercel env pull'."
  );
}

export async function embedText(text: string): Promise<number[]> {
  ensureProviderConfigured();
  const { embedding } = await embed({
    model: embeddingModel(),
    value: text,
  });
  return embedding;
}

/**
 * Batch helper. Chunked at 100 inputs to keep payloads small and
 * retry-friendly even though the underlying model accepts more.
 */
export async function embedBatch(texts: readonly string[]): Promise<number[][]> {
  ensureProviderConfigured();
  const out: number[][] = [];
  const chunkSize = 100;
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const { embeddings } = await embedMany({
      model: embeddingModel(),
      values: chunk as string[],
    });
    out.push(...embeddings);
  }
  return out;
}

/** Re-export for symmetry with existing callers that referenced this. */
export { isMissingEnvError };
