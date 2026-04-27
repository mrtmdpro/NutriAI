import "server-only";
import { isAuthorizedCron, unauthorized } from "@/lib/cron/auth";
import { fetchSupplementRecalls } from "@/lib/knowledge/openfda";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily ingestion of OpenFDA dietary-supplement recalls.
 *
 * Sprint 2: fetch + log only. Persisting recalls into a dedicated
 * `recalls` table is planned for Sprint 4 (Adherence Tracking) where
 * we can push recall alerts to users whose regimens reference the
 * affected ingredient. Until then the cron job's value is operational
 * visibility — recall counts surface in Vercel logs.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();

  const stats = { recalls_30d: 0, class_i: 0, class_ii: 0, class_iii: 0 };

  try {
    const recalls = await fetchSupplementRecalls(30);
    stats.recalls_30d = recalls.length;
    for (const r of recalls) {
      if (r.classification.includes("I")) stats.class_i += 1;
      else if (r.classification.includes("II")) stats.class_ii += 1;
      else if (r.classification.includes("III")) stats.class_iii += 1;
    }
  } catch (err) {
    console.error("[ingest-openfda] failed:", err);
    return Response.json({ ok: false, stats, error: String(err) }, { status: 500 });
  }

  return Response.json({ ok: true, stats });
}
