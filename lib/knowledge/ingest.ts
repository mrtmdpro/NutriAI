import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { DsldLabel } from "@/lib/knowledge/dsld";
import type { PubmedSummary } from "@/lib/knowledge/pubmed";
import { inferEvidenceTier } from "@/lib/knowledge/pubmed";
import { embedText } from "@/lib/knowledge/embed";
import { translateBoth } from "@/lib/knowledge/translate";

/**
 * High-level ingest helpers used by the cron route handlers.
 *
 * Idempotency strategy:
 *   - All upserts use `onConflict` against a stable natural key
 *     (`slug` for ingredients/supplements, `(source, source_ref)`
 *     for clinical_evidence) so concurrent runs don't race.
 *   - LLM cost is fenced behind an existence check so re-runs are
 *     cheap; the upsert itself is the safety net if two runs slip
 *     through the existence check simultaneously.
 *
 * Sprint 2 deliberately keeps DSLD-driven ingestion *cheap*:
 *   - Supplement: 1 translation (name + description), 0 embeddings
 *   - Ingredient (DSLD path): 0 LLM calls — name only, English-only.
 *     PubMed enrichment adds bilingual descriptions + embeddings later
 *     in `enrichIngredient()`.
 * This keeps each cron run inside the 5-minute budget.
 */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Ensure an ingredient row exists for the given English name.
 *
 * Sprint 2: cheap path. Creates the row with name + slug + category
 * only. Bilingual description and embedding are filled in lazily by
 * `enrichIngredient` (called from the PubMed cron once we have
 * evidence to ground the description on).
 */
export async function ensureIngredient(input: {
  nameEn: string;
  category: string;
}): Promise<{ id: string }> {
  const supabase = createServiceClient();
  const slug = slugify(input.nameEn);

  // Idempotent upsert against `slug`. ignoreDuplicates: false so we
  // get the row id back regardless of whether we just created it or
  // it already existed.
  const { data, error } = await supabase
    .from("ingredients")
    .upsert(
      {
        slug,
        name_en: input.nameEn,
        category: input.category,
      },
      { onConflict: "slug", ignoreDuplicates: false }
    )
    .select("id")
    .single();
  if (error) throw new Error(`ensureIngredient(${slug}): ${error.message}`);
  return { id: data!.id as string };
}

/**
 * Add bilingual description + embedding to an ingredient that doesn't
 * yet have them. Idempotent: returns early if the row already has both.
 */
export async function enrichIngredient(ingredientId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("ingredients")
    .select("id, name_en, description_en, description_vn, embedding")
    .eq("id", ingredientId)
    .single();
  if (error || !row) return;
  if (row.description_en && row.description_vn && row.embedding) return;

  const seed = `${row.name_en}: a nutritional supplement ingredient.`;
  const [translation, embedding, nameTranslation] = await Promise.all([
    translateBoth(
      seed,
      "Nutritional supplement ingredient. Audience: general consumer."
    ),
    embedText(`${row.name_en}. ${seed}`),
    // Translate the name as a noun phrase so name_vn isn't a sentence.
    translateBoth(
      row.name_en as string,
      "Translate this ingredient name to Vietnamese. Output a noun phrase only, no sentence, no period."
    ),
  ]);

  await supabase
    .from("ingredients")
    .update({
      name_vn: nameTranslation.vn.replace(/[.\n]/g, "").trim().slice(0, 80),
      description_en: translation.en,
      description_vn: translation.vn,
      embedding,
    })
    .eq("id", ingredientId);
}

/**
 * Upsert a supplement plus its M:N ingredient links from a DSLD label.
 *
 * Translation is constrained to the supplement card (name + description).
 * Ingredient enrichment is deferred to `enrichIngredient` so this path
 * stays inside the cron budget.
 */
export async function upsertSupplementFromDsld(
  label: DsldLabel
): Promise<{ id: string; created: boolean }> {
  const supabase = createServiceClient();
  const slug = `dsld-${label.dsldId}`;

  const { data: existing } = await supabase
    .from("supplements")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  const wasNew = !existing;

  // Translate name + description independently so name_vn is a clean
  // noun phrase rather than the first clause of a description.
  const descSeed = [
    label.fullName,
    label.brandName ? `by ${label.brandName}` : "",
    label.productType ?? "",
    label.form ?? "",
  ]
    .filter(Boolean)
    .join(". ");

  const [nameTranslation, descTranslation] = await Promise.all([
    translateBoth(
      label.fullName,
      "Translate this supplement product name to Vietnamese. Output a noun phrase, no sentence."
    ),
    translateBoth(
      descSeed,
      "Dietary supplement product description. Audience: general consumer."
    ),
  ]);

  const { data: upserted, error: suppErr } = await supabase
    .from("supplements")
    .upsert(
      {
        slug,
        name_en: label.fullName,
        name_vn: nameTranslation.vn.replace(/[.\n]/g, "").trim().slice(0, 120),
        brand: label.brandName ?? "Unknown",
        form: label.form ?? null,
        net_quantity: label.netContent ?? null,
        description_en: descTranslation.en,
        description_vn: descTranslation.vn,
        source_url: label.url,
      },
      { onConflict: "slug", ignoreDuplicates: false }
    )
    .select("id")
    .single();
  if (suppErr) throw new Error(`upsertSupplement(${slug}): ${suppErr.message}`);
  const supplementId = upserted!.id as string;

  // Link ingredients. Skip rows with no quantity — meaningless join data
  // pollutes the UI. Per-ingredient failures are tolerated.
  for (const ing of label.ingredients) {
    if (!ing.name) continue;
    if (ing.quantity == null || !ing.unit) continue;
    try {
      const { id: ingredientId } = await ensureIngredient({
        nameEn: ing.name,
        category: ing.category ?? "unknown",
      });
      const { error } = await supabase.from("supplement_ingredients").upsert(
        {
          supplement_id: supplementId,
          ingredient_id: ingredientId,
          dose: ing.quantity,
          unit: ing.unit,
          pct_daily_value: ing.dailyValuePct ?? null,
        },
        { onConflict: "supplement_id,ingredient_id" }
      );
      if (error) {
        console.warn(`[ingest] link ${ing.name} failed:`, error.message);
      }
    } catch (err) {
      console.warn(`[ingest] ingredient ${ing.name} failed:`, err);
    }
  }

  return { id: supplementId, created: wasNew };
}

export async function upsertEvidenceFromPubmed(input: {
  ingredientId: string;
  summary: PubmedSummary;
}): Promise<{ created: boolean }> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("clinical_evidence")
    .select("id")
    .eq("source", "pubmed")
    .eq("source_ref", input.summary.pmid)
    .maybeSingle();
  if (existing) return { created: false };

  const tier = inferEvidenceTier(input.summary.publicationTypes);
  const seed =
    input.summary.abstract && input.summary.abstract.length > 0
      ? input.summary.abstract
      : input.summary.title;
  const [translation, embedding] = await Promise.all([
    translateBoth(seed, `Clinical evidence summary. PubMed PMID ${input.summary.pmid}.`),
    embedText(`${input.summary.title}\n${seed}`),
  ]);

  const publishedAt = parsePubmedDate(input.summary.publishedAt);

  const { error } = await supabase.from("clinical_evidence").upsert(
    {
      ingredient_id: input.ingredientId,
      source: "pubmed",
      source_ref: input.summary.pmid,
      title_en: input.summary.title,
      summary_en: translation.en,
      summary_vn: translation.vn,
      tier,
      citation_url: input.summary.url,
      published_at: publishedAt,
      embedding,
    },
    { onConflict: "source,source_ref", ignoreDuplicates: false }
  );
  if (error) {
    throw new Error(`upsertEvidence(pubmed:${input.summary.pmid}): ${error.message}`);
  }
  return { created: true };
}

const PUBMED_MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Parse a PubMed `pubdate` field to a SQL `DATE`-compatible string.
 *
 * PubMed values come in many shapes: `"2024 Mar 15"`, `"2024 Mar"`,
 * `"2024 Spring"`, `"2024 Mar-Apr"`, `"2024 Apr 1-15"`, `"2024"`.
 *
 * We extract year + month (default Jan) + day (default 1), then
 * validate the calendar date — if the day overflows the month
 * (e.g. Apr 31, Feb 29 in a non-leap year), we clamp to the last day
 * of the intended month so Postgres accepts the literal.
 */
function parsePubmedDate(input?: string): string | null {
  if (!input) return null;
  const yearMatch = /\d{4}/.exec(input);
  if (!yearMatch) return null;
  const year = Number(yearMatch[0]);

  const monthMatch = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.exec(
    input
  );
  const monthIdx = monthMatch ? PUBMED_MONTHS[monthMatch[1].toLowerCase()] : 1;

  const dayMatch = /\b(\d{1,2})\b/.exec(input.replace(yearMatch[0], ""));
  let day = dayMatch ? Number(dayMatch[1]) : 1;
  if (day < 1) day = 1;

  // Clamp day to the last day of the intended month if it overflows.
  // Date.UTC(year, monthIdx, 0) returns the last day of (monthIdx-1).
  const lastDay = new Date(Date.UTC(year, monthIdx, 0)).getUTCDate();
  if (day > lastDay) day = lastDay;

  return `${year}-${String(monthIdx).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
