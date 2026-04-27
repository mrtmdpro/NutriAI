import "server-only";
import { embed, embedMany } from "ai";
import { requireServerEnv } from "@/lib/env/server";

/**
 * Embedding model. We pin to OpenAI's text-embedding-3-small at 1536
 * dimensions to match the `vector(1536)` column type. Keep this in
 * sync with supabase/migrations/0003_knowledge_hub.sql if you ever
 * change models.
 *
 * Model is referenced as a "provider/model" string so the Vercel AI
 * Gateway can swap providers without us re-importing a different
 * SDK package. AI_GATEWAY_API_KEY is read from the environment.
 */
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

function ensureGatewayConfigured(): void {
  // requireServerEnv throws if missing. We call it once at the top so
  // ETL jobs fail fast on misconfiguration rather than mid-stream.
  requireServerEnv("AI_GATEWAY_API_KEY");
}

export async function embedText(text: string): Promise<number[]> {
  ensureGatewayConfigured();
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: text,
  });
  return embedding;
}

/**
 * Batch helper. AI Gateway accepts up to 2048 inputs per call for the
 * OpenAI embedding endpoint, but we conservatively chunk at 100 to keep
 * payloads small and retry-friendly.
 */
export async function embedBatch(texts: readonly string[]): Promise<number[][]> {
  ensureGatewayConfigured();
  const out: number[][] = [];
  const chunkSize = 100;
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL,
      values: chunk as string[],
    });
    out.push(...embeddings);
  }
  return out;
}
