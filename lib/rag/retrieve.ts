import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/knowledge/embed";
import { isMissingEnvError } from "@/lib/env/server";

export type RetrievedChunk = {
  source: "evidence" | "article" | "ingredient" | "supplement";
  sourceId: string;
  /** Stable URL/slug for the source (PMID for evidence). */
  slug: string;
  /** Citation key the model should reference, e.g. "c1". */
  citationKey: string;
  title: string;
  content: string;
  /** Public URL to send the user to when they click the chip. */
  href: string;
  score: number;
};

const MAX_CHUNKS = 12;
const PER_CHUNK_CHARS = 600;

function buildHref(chunk: {
  source: RetrievedChunk["source"];
  slug: string;
  citationUrl: string | null;
}): string {
  if (chunk.source === "evidence" && chunk.citationUrl) return chunk.citationUrl;
  if (chunk.source === "supplement") return `/supplements/${chunk.slug}`;
  if (chunk.source === "article") return `/feed`;
  if (chunk.source === "ingredient") return `/search?q=${encodeURIComponent(chunk.slug)}`;
  return "/";
}

/**
 * Retrieve the most-relevant chunks for a user's query. Returns at most
 * `MAX_CHUNKS` rows, each truncated to `PER_CHUNK_CHARS` characters so
 * the prompt stays bounded.
 *
 * Tries hybrid retrieval (FTS + vector) when the AI Gateway is
 * configured; falls back to FTS-only if embedding fails.
 */
export async function retrieveChunks(
  query: string
): Promise<RetrievedChunk[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    if (isMissingEnvError(err)) return [];
    throw err;
  }

  let embedding: number[] | null = null;
  try {
    embedding = await embedText(trimmed);
  } catch (err) {
    if (!isMissingEnvError(err)) {
      console.error("[rag] embedText failed:", err);
    }
    embedding = null;
  }

  const { data, error } = await supabase.rpc("search_knowledge_hybrid", {
    query: trimmed,
    query_embedding: embedding,
    total_limit: MAX_CHUNKS,
  });
  if (error) {
    console.error("[rag] hybrid search failed:", error);
    return [];
  }

  type RpcRow = {
    source: RetrievedChunk["source"];
    source_id: string;
    slug: string;
    title: string;
    content: string;
    citation_url: string | null;
    score: number;
  };

  return ((data ?? []) as unknown as RpcRow[]).map((row, idx) => ({
    source: row.source,
    sourceId: row.source_id,
    slug: row.slug,
    citationKey: `c${idx + 1}`,
    title: row.title,
    content:
      row.content.length > PER_CHUNK_CHARS
        ? `${row.content.slice(0, PER_CHUNK_CHARS - 1)}…`
        : row.content,
    href: buildHref({
      source: row.source,
      slug: row.slug,
      citationUrl: row.citation_url,
    }),
    score: row.score,
  }));
}

/**
 * Format chunks as numbered context the model can quote and cite. Each
 * chunk header includes the citation key the model is required to use.
 */
export function formatContext(chunks: readonly RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "No retrieved context.";
  }
  return chunks
    .map(
      (c) =>
        `[${c.citationKey}] (${c.source}) ${c.title}\n${c.content || "(no body)"}`
    )
    .join("\n\n");
}
