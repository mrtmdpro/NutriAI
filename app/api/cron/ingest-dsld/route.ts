import "server-only";
import { isAuthorizedCron, unauthorized } from "@/lib/cron/auth";
import {
  searchDsld,
  getDsldLabel,
  SEED_QUERIES,
} from "@/lib/knowledge/dsld";
import { upsertSupplementFromDsld } from "@/lib/knowledge/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

// Process 5 queries × 3 hits = 15 supplements per run. Rotation is
// driven by day-of-month so SEED_QUERIES is fully covered every
// ceil(20 / 5) = 4 days. Idempotent on `slug = dsld-<dsldId>` so any
// overlap with prior runs is a no-op.
const QUERIES_PER_RUN = 5;
const HITS_PER_QUERY = 3;

function rotatedSlice<T>(list: readonly T[], dayOfMonth: number, n: number): T[] {
  const start = ((dayOfMonth - 1) * n) % list.length;
  const out: T[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(list[(start + i) % list.length]);
  }
  return out;
}

/**
 * Daily ingestion of NIH ODS Dietary Supplement Label Database (DSLD).
 *
 * Walks a rotated slice of SEED_QUERIES, takes the top-3 on-market hit
 * per query, fetches the full label, and upserts via
 * lib/knowledge/ingest.ts.
 *
 * Idempotent: rows are keyed on `slug = "dsld-<dsldId>"`. Re-running
 * upserts in place without duplicating data.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();

  const day = new Date().getUTCDate();
  const slice = rotatedSlice(SEED_QUERIES, day, QUERIES_PER_RUN);

  const stats = {
    queries: 0,
    hits: 0,
    supplements_created: 0,
    errors: 0,
    slice_start_query: slice[0],
  };
  // First 3 error messages are surfaced in the response body so cron
  // failures are observable without runtime log access. Logs still
  // capture the full stack via console.error.
  const sampleErrors: string[] = [];

  for (const query of slice) {
    stats.queries += 1;
    try {
      const hits = await searchDsld(query, HITS_PER_QUERY);
      stats.hits += hits.length;
      for (const hit of hits) {
        try {
          const label = await getDsldLabel(hit.dsldId);
          if (!label) continue;
          const { created } = await upsertSupplementFromDsld(label);
          if (created) stats.supplements_created += 1;
        } catch (err) {
          stats.errors += 1;
          if (sampleErrors.length < 3) {
            sampleErrors.push(
              `${hit.dsldId}: ${(err as Error).message ?? String(err)}`
            );
          }
          console.error(`[ingest-dsld] ${hit.dsldId} failed:`, err);
        }
      }
    } catch (err) {
      stats.errors += 1;
      if (sampleErrors.length < 3) {
        sampleErrors.push(
          `query "${query}": ${(err as Error).message ?? String(err)}`
        );
      }
      console.error(`[ingest-dsld] query "${query}" failed:`, err);
    }
  }

  return Response.json({
    ok: true,
    stats,
    ...(sampleErrors.length > 0 ? { sampleErrors } : {}),
  });
}
