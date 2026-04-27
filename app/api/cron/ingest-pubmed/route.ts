import "server-only";
import { isAuthorizedCron, unauthorized } from "@/lib/cron/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  searchPubmed,
  fetchPubmedSummaries,
} from "@/lib/knowledge/pubmed";
import {
  upsertEvidenceFromPubmed,
  enrichIngredient,
} from "@/lib/knowledge/ingest";

export const runtime = "nodejs";
// 5-minute budget. We cap per-run work at ~15 ingredients × ~2 evidence
// items so the run completes well inside the budget; un-enriched
// ingredients cycle on the next day.
export const maxDuration = 300;

const INGREDIENTS_PER_RUN = 15;
const EVIDENCE_PER_INGREDIENT = 2;

/**
 * Daily ingestion of PubMed clinical evidence + lazy ingredient
 * enrichment.
 *
 * Per cycle, for the 15 oldest-updated ingredients:
 *   1. Enrich the ingredient (bilingual description + embedding) if
 *      it lacks them. Cost: 3 LLM calls.
 *   2. Search PubMed for top-2 RCT/meta-analysis PMIDs.
 *   3. Upsert summaries into clinical_evidence. Cost per new row:
 *      2 LLM calls.
 *
 * Steady-state cost per run (worst case):
 *   15 × 3 + 15 × 2 × 2 = 105 LLM calls × ~1.5s = ~150s.
 *
 * Idempotent on (source = 'pubmed', source_ref = pmid) and on
 * ingredient enrichment (no-op if description + embedding already set).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();

  const supabase = createServiceClient();
  const stats = {
    ingredients: 0,
    enriched: 0,
    queries: 0,
    hits: 0,
    evidence_created: 0,
    errors: 0,
  };

  const { data: ingredients, error } = await supabase
    .from("ingredients")
    .select("id, name_en, description_en, embedding")
    .order("updated_at", { ascending: true })
    .limit(INGREDIENTS_PER_RUN);
  if (error) {
    return Response.json(
      { ok: false, stats, error: error.message },
      { status: 500 }
    );
  }

  for (const ing of ingredients ?? []) {
    stats.ingredients += 1;
    try {
      // Lazy enrichment.
      if (!ing.description_en || !ing.embedding) {
        try {
          await enrichIngredient(ing.id as string);
          stats.enriched += 1;
        } catch (err) {
          stats.errors += 1;
          console.error(`[ingest-pubmed] enrich ${ing.id} failed:`, err);
        }
      }

      const pmids = await searchPubmed(
        ing.name_en as string,
        EVIDENCE_PER_INGREDIENT
      );
      stats.queries += 1;
      const summaries = await fetchPubmedSummaries(pmids);
      stats.hits += summaries.length;
      for (const summary of summaries) {
        try {
          const { created } = await upsertEvidenceFromPubmed({
            ingredientId: ing.id as string,
            summary,
          });
          if (created) stats.evidence_created += 1;
        } catch (err) {
          stats.errors += 1;
          console.error(`[ingest-pubmed] ${summary.pmid} failed:`, err);
        }
      }
    } catch (err) {
      stats.errors += 1;
      console.error(`[ingest-pubmed] ingredient ${ing.id} failed:`, err);
    }
  }

  return Response.json({ ok: true, stats });
}
