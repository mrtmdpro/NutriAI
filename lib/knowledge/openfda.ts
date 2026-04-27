import "server-only";

/**
 * OpenFDA client.
 *
 * Public API at https://api.fda.gov/. We're interested in the
 * /drug/enforcement endpoint (recalls) and /food/enforcement
 * (dietary-supplement recalls land here). No key required for low
 * volume; an api_key raises the per-IP cap.
 */

const OPENFDA_BASE = "https://api.fda.gov";

export type FdaRecall = {
  recallNumber: string;
  productDescription: string;
  reasonForRecall: string;
  classification: string; // "Class I" | "Class II" | "Class III"
  recallInitiationDate?: string;
  status: string;
  url: string;
};

async function fdaJson(path: string): Promise<unknown> {
  const res = await fetch(`${OPENFDA_BASE}${path}`, {
    headers: { Accept: "application/json" },
    // OpenFDA recall data updates roughly weekly. Cache 24h to cut load.
    next: { revalidate: 86_400 },
  });
  // OpenFDA returns 404 with `{ error: { code: "NOT_FOUND" } }` when no
  // results match — that's "empty" in our model, not failure.
  if (res.status === 404) return { results: [] };
  if (!res.ok) throw new Error(`OpenFDA ${path} → ${res.status}`);
  return res.json();
}

/**
 * Fetch dietary-supplement-related food recalls from the last `daysBack`
 * days. We filter by product description containing "supplement" since
 * the food endpoint covers all foods.
 *
 * Important: OpenFDA's query language uses literal `+` only when the
 * server actually receives a `+` byte. Writing `+AND+` in the source
 * string makes URLSearchParams encode it as `%2B`, which OpenFDA then
 * URL-decodes back to `+` — and Lucene parses `+AND` as "must include
 * term AND" instead of the boolean. Use spaces in the source so they
 * encode to `+`, decode back to space, and parse as the boolean.
 */
export async function fetchSupplementRecalls(
  daysBack = 30
): Promise<FdaRecall[]> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  const search = `product_description:supplement AND recall_initiation_date:[${since} TO 99991231]`;
  const params = new URLSearchParams({ search, limit: "100" });
  const path = `/food/enforcement.json?${params.toString()}`;

  const json = (await fdaJson(path)) as {
    results?: Array<Record<string, unknown>>;
  };
  const results = json.results ?? [];
  return results.map((r): FdaRecall => {
    const recallNumber = (r.recall_number as string) ?? "";
    return {
      recallNumber,
      productDescription: (r.product_description as string) ?? "",
      reasonForRecall: (r.reason_for_recall as string) ?? "",
      classification: (r.classification as string) ?? "",
      recallInitiationDate: r.recall_initiation_date as string | undefined,
      status: (r.status as string) ?? "",
      // Human-readable citation page on fda.gov (the API URL is for
      // machines). Recall numbers are stable identifiers.
      url: `https://www.accessdata.fda.gov/scripts/ires/index.cfm?Product=${encodeURIComponent(
        recallNumber
      )}`,
    };
  });
}
