import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isMissingEnvError } from "@/lib/env/server";
import { pickLocale } from "@/lib/i18n/locale-text";
import type { Locale } from "@/i18n/routing";

/**
 * Knowledge Hub retrieval helpers used by /search and (later) the RAG
 * assistant.
 *
 * Sprint 3 ships full-text search via Postgres `tsvector @@ websearch_to_tsquery`.
 * Vector retrieval over `embedding` columns is wired in the schema but
 * not blended in here yet — Sprint 5 (RAG) closes that loop with a
 * dedicated SQL function that scores hybrid (FTS + cosine) and ranks.
 */

const PAGE_SIZE = 12;
const PAGE_MAX = 100;
const INGREDIENT_RAIL_SIZE = 8;
const ARTICLE_BODY_PREVIEW_CHARS = 280;

export type SupplementHit = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  form: string | null;
  description: string | null;
  price_vnd: number | null;
  quality_tier: "S" | "A" | "B" | "C" | null;
  quality_total: number | null;
};

export type IngredientHit = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
};

export type SearchResults = {
  supplements: SupplementHit[];
  ingredients: IngredientHit[];
  isEmpty: boolean;
  hadConfigError: boolean;
};

/**
 * Coerce an arbitrary input to a sane page number. Centralized so the
 * page component can hand us `Number(searchParams.page)` directly even
 * when that's NaN.
 */
function clampPage(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 1;
  return Math.min(PAGE_MAX, Math.max(1, Math.floor(raw)));
}

/** Bilingual row shapes used at each call site, so pickLocale binds correctly. */
type SuppRow = {
  id: string;
  slug: string;
  brand: string;
  form: string | null;
  price_vnd: number | null;
  name_vn: string | null;
  name_en: string;
  description_vn: string | null;
  description_en: string | null;
  quality_index:
    | { tier: "S" | "A" | "B" | "C"; total_score: number }
    | { tier: "S" | "A" | "B" | "C"; total_score: number }[]
    | null;
};

type IngRow = {
  id: string;
  slug: string;
  category: string;
  name_vn: string | null;
  name_en: string;
  description_vn: string | null;
  description_en: string | null;
};

export async function searchKnowledge(input: {
  query: string;
  locale: Locale;
  category?: string;
  page?: number;
}): Promise<SearchResults> {
  const empty: SearchResults = {
    supplements: [],
    ingredients: [],
    isEmpty: true,
    hadConfigError: false,
  };

  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return { ...empty, hadConfigError: true };
    throw err;
  }

  const page = clampPage(input.page);
  const offset = (page - 1) * PAGE_SIZE;
  const trimmed = input.query.trim();

  let suppQuery = supabase
    .from("supplements")
    .select(
      `
      id, slug, name_vn, name_en, brand, form, description_vn, description_en,
      price_vnd,
      quality_index ( tier, total_score )
    `
    )
    .range(offset, offset + PAGE_SIZE - 1);
  if (trimmed.length > 0) {
    suppQuery = suppQuery.textSearch("search_vector", trimmed, {
      type: "websearch",
      config: "simple",
    });
  } else {
    suppQuery = suppQuery.order("created_at", { ascending: false });
  }

  // The ingredient rail is fixed-size and only shown on page 1 (the page
  // component decides). We always fetch the same first slice here.
  //
  // Derivatives (e.g. Creatine HCl) are filtered out at the top level —
  // they surface as variants under their parent's ingredient page so
  // search results stay focused on canonical molecules.
  let ingQuery = supabase
    .from("ingredients")
    .select(
      `id, slug, name_vn, name_en, category, description_vn, description_en`
    )
    .is("parent_ingredient_id", null)
    .range(0, INGREDIENT_RAIL_SIZE - 1);
  if (trimmed.length > 0) {
    ingQuery = ingQuery.textSearch("search_vector", trimmed, {
      type: "websearch",
      config: "simple",
    });
  } else {
    ingQuery = ingQuery.order("created_at", { ascending: false });
  }
  if (input.category && input.category !== "all") {
    ingQuery = ingQuery.eq("category", input.category);
  }

  const [{ data: suppRows, error: suppErr }, { data: ingRows, error: ingErr }] =
    await Promise.all([suppQuery, ingQuery]);
  if (suppErr) console.error("[search] supplements query failed:", suppErr);
  if (ingErr) console.error("[search] ingredients query failed:", ingErr);

  const supplements: SupplementHit[] = ((suppRows ?? []) as unknown as SuppRow[]).map(
    (row) => {
      const qiRaw = row.quality_index;
      const qi = Array.isArray(qiRaw) ? qiRaw[0] : qiRaw;
      return {
        id: row.id,
        slug: row.slug,
        name: pickLocale(row, "name", input.locale),
        brand: row.brand,
        form: row.form,
        description: pickLocale(row, "description", input.locale) || null,
        price_vnd: row.price_vnd,
        quality_tier: qi?.tier ?? null,
        quality_total: qi?.total_score ?? null,
      };
    }
  );

  const ingredients: IngredientHit[] = ((ingRows ?? []) as unknown as IngRow[]).map(
    (row) => ({
      id: row.id,
      slug: row.slug,
      name: pickLocale(row, "name", input.locale),
      category: row.category,
      description: pickLocale(row, "description", input.locale) || null,
    })
  );

  return {
    supplements,
    ingredients,
    isEmpty: supplements.length === 0 && ingredients.length === 0,
    hadConfigError: false,
  };
}

type SupplementDetailRow = {
  id: string;
  slug: string;
  brand: string;
  form: string | null;
  net_quantity: string | null;
  source_url: string | null;
  price_vnd: number | null;
  affiliate_url: string | null;
  affiliate_platform: string | null;
  name_vn: string | null;
  name_en: string;
  description_vn: string | null;
  description_en: string | null;
  supplement_ingredients: Array<{
    dose: number;
    unit: string;
    pct_daily_value: number | null;
    ingredients: {
      id: string;
      slug: string;
      category: string;
      name_vn: string | null;
      name_en: string;
      description_vn: string | null;
      description_en: string | null;
    };
  }>;
  quality_index:
    | {
        lab_test_score: number;
        ingredient_quality_score: number;
        price_per_dose_score: number;
        total_score: number;
        tier: "S" | "A" | "B" | "C";
        notes: string | null;
      }
    | {
        lab_test_score: number;
        ingredient_quality_score: number;
        price_per_dose_score: number;
        total_score: number;
        tier: "S" | "A" | "B" | "C";
        notes: string | null;
      }[]
    | null;
};

type EvidenceRow = {
  id: string;
  ingredient_id: string;
  source: string;
  source_ref: string;
  title_en: string;
  summary_vn: string | null;
  summary_en: string | null;
  tier: "A" | "B" | "C" | "D";
  citation_url: string;
  published_at: string | null;
};

export async function getSupplementBySlug(input: {
  slug: string;
  locale: Locale;
}) {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return null;
    throw err;
  }

  const { data, error } = await supabase
    .from("supplements")
    .select(
      `
      id, slug, name_vn, name_en, brand, form, net_quantity,
      description_vn, description_en, source_url, price_vnd,
      affiliate_url, affiliate_platform,
      created_at,
      supplement_ingredients (
        dose, unit, pct_daily_value,
        ingredients (
          id, slug, name_vn, name_en, category,
          description_vn, description_en
        )
      ),
      quality_index (
        lab_test_score, ingredient_quality_score, price_per_dose_score,
        total_score, tier, notes
      )
    `
    )
    .eq("slug", input.slug)
    .maybeSingle();
  if (error) {
    console.error("[getSupplementBySlug] query failed:", error);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as SupplementDetailRow;
  const qiRaw = row.quality_index;
  const qi = Array.isArray(qiRaw) ? qiRaw[0] ?? null : qiRaw ?? null;

  const ingredients = row.supplement_ingredients.map((link) => ({
    id: link.ingredients.id,
    slug: link.ingredients.slug,
    name: pickLocale(link.ingredients, "name", input.locale),
    category: link.ingredients.category,
    description:
      pickLocale(link.ingredients, "description", input.locale) || null,
    dose: link.dose,
    unit: link.unit,
    dailyValuePct: link.pct_daily_value,
  }));

  const ingredientIds = ingredients.map((i) => i.id);
  const evidence: Array<{
    id: string;
    title: string;
    summary: string;
    source: string;
    sourceRef: string;
    tier: "A" | "B" | "C" | "D";
    citationUrl: string;
    publishedAt: string | null;
    ingredientId: string;
  }> = [];

  if (ingredientIds.length > 0) {
    const { data: evidenceRows, error: evErr } = await supabase
      .from("clinical_evidence")
      .select(
        "id, ingredient_id, source, source_ref, title_en, summary_vn, summary_en, tier, citation_url, published_at"
      )
      .in("ingredient_id", ingredientIds)
      .order("published_at", { ascending: false })
      .limit(20);
    if (evErr) console.error("[getSupplementBySlug] evidence query failed:", evErr);
    for (const r of (evidenceRows ?? []) as unknown as EvidenceRow[]) {
      evidence.push({
        id: r.id,
        title: r.title_en,
        summary: pickLocale(r, "summary", input.locale),
        source: r.source,
        sourceRef: r.source_ref,
        tier: r.tier,
        citationUrl: r.citation_url,
        publishedAt: r.published_at,
        ingredientId: r.ingredient_id,
      });
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    name: pickLocale(row, "name", input.locale),
    brand: row.brand,
    form: row.form,
    netQuantity: row.net_quantity,
    description: pickLocale(row, "description", input.locale) || null,
    sourceUrl: row.source_url,
    priceVnd: row.price_vnd,
    affiliateUrl: row.affiliate_url,
    affiliatePlatform: row.affiliate_platform,
    ingredients,
    evidence,
    quality: qi
      ? {
          lab: qi.lab_test_score,
          ingredient: qi.ingredient_quality_score,
          price: qi.price_per_dose_score,
          total: qi.total_score,
          tier: qi.tier,
          notes: qi.notes,
        }
      : null,
  };
}

export type SupplementDetail = NonNullable<
  Awaited<ReturnType<typeof getSupplementBySlug>>
>;

type QualityIndexRow = {
  tier: "S" | "A" | "B" | "C";
  total_score: number;
  lab_test_score: number;
  ingredient_quality_score: number;
  price_per_dose_score: number;
  supplements: {
    slug: string;
    brand: string;
    price_vnd: number | null;
    name_vn: string | null;
    name_en: string;
  } | null;
};

export async function listQualityIndex(input: { locale: Locale }): Promise<
  Array<{
    supplementSlug: string;
    supplementName: string;
    brand: string;
    tier: "S" | "A" | "B" | "C";
    total: number;
    lab: number;
    ingredient: number;
    price: number;
    priceVnd: number | null;
  }>
> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return [];
    throw err;
  }

  const { data, error } = await supabase
    .from("quality_index")
    .select(
      `
      tier, total_score, lab_test_score, ingredient_quality_score, price_per_dose_score,
      supplements!inner ( slug, name_vn, name_en, brand, price_vnd )
    `
    )
    .order("total_score", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[listQualityIndex] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as QualityIndexRow[])
    .filter((r) => r.supplements != null)
    .map((r) => {
      const supp = r.supplements!;
      return {
        supplementSlug: supp.slug,
        supplementName: pickLocale(supp, "name", input.locale),
        brand: supp.brand,
        tier: r.tier,
        total: r.total_score,
        lab: r.lab_test_score,
        ingredient: r.ingredient_quality_score,
        price: r.price_per_dose_score,
        priceVnd: supp.price_vnd,
      };
    });
}

export type RankedSupplement = {
  slug: string;
  name: string;
  brand: string;
  form: string | null;
  description: string | null;
  priceVnd: number | null;
  affiliateUrl: string | null;
  affiliatePlatform: string | null;
  qualityTier: "S" | "A" | "B" | "C" | null;
  qualityTotal: number | null;
  qualityLab: number | null;
  qualityIngredient: number | null;
  qualityPrice: number | null;
  notes: string | null;
};

type RankedSuppRow = {
  slug: string;
  brand: string;
  form: string | null;
  price_vnd: number | null;
  affiliate_url: string | null;
  affiliate_platform: string | null;
  name_vn: string | null;
  name_en: string;
  description_vn: string | null;
  description_en: string | null;
  quality_index:
    | {
        tier: "S" | "A" | "B" | "C";
        total_score: number;
        lab_test_score: number;
        ingredient_quality_score: number;
        price_per_dose_score: number;
        notes: string | null;
      }
    | {
        tier: "S" | "A" | "B" | "C";
        total_score: number;
        lab_test_score: number;
        ingredient_quality_score: number;
        price_per_dose_score: number;
        notes: string | null;
      }[]
    | null;
};

/**
 * Rank all supplements that contain a given ingredient (by
 * `ingredient_id`). Sorted by quality_index.total_score desc with
 * unranked supplements at the bottom (alphabetic tiebreaker).
 */
export async function listSupplementsByIngredientId(input: {
  ingredientId: string;
  locale: Locale;
}): Promise<RankedSupplement[]> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return [];
    throw err;
  }

  const { data: links, error: linkErr } = await supabase
    .from("supplement_ingredients")
    .select("supplement_id")
    .eq("ingredient_id", input.ingredientId);
  if (linkErr || !links) {
    if (linkErr) console.error("[listSupplementsByIngredientId] link query failed:", linkErr);
    return [];
  }
  const supplementIds = Array.from(
    new Set(links.map((l) => l.supplement_id))
  );
  if (supplementIds.length === 0) return [];

  const { data: rows, error } = await supabase
    .from("supplements")
    .select(
      `
      slug, name_vn, name_en, brand, form, description_vn, description_en, price_vnd,
      affiliate_url, affiliate_platform,
      quality_index ( tier, total_score, lab_test_score, ingredient_quality_score, price_per_dose_score, notes )
    `
    )
    .in("id", supplementIds);
  if (error || !rows) {
    if (error) console.error("[listSupplementsByIngredientId] supp query failed:", error);
    return [];
  }

  const out: RankedSupplement[] = (rows as unknown as RankedSuppRow[]).map(
    (row) => {
      const qiRaw = row.quality_index;
      const qi = Array.isArray(qiRaw) ? qiRaw[0] : qiRaw;
      return {
        slug: row.slug,
        name: pickLocale(row, "name", input.locale),
        brand: row.brand,
        form: row.form,
        description: pickLocale(row, "description", input.locale) || null,
        priceVnd: row.price_vnd,
        affiliateUrl: row.affiliate_url,
        affiliatePlatform: row.affiliate_platform,
        qualityTier: qi?.tier ?? null,
        qualityTotal: qi?.total_score ?? null,
        qualityLab: qi?.lab_test_score ?? null,
        qualityIngredient: qi?.ingredient_quality_score ?? null,
        qualityPrice: qi?.price_per_dose_score ?? null,
        notes: qi?.notes ?? null,
      };
    }
  );

  out.sort((a, b) => {
    const at = a.qualityTotal ?? -1;
    const bt = b.qualityTotal ?? -1;
    if (at !== bt) return bt - at;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export type IngredientEvidence = {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceRef: string;
  tier: "A" | "B" | "C" | "D";
  citationUrl: string;
  publishedAt: string | null;
};

/**
 * Latest peer-reviewed evidence rows for an ingredient. Used by the
 * /[locale]/ingredients/[slug] page's evidence section. Sorted by
 * published_at desc; tier A/B float to the top via the tier secondary
 * sort.
 */
export async function listEvidenceByIngredient(input: {
  ingredientId: string;
  locale: Locale;
  limit?: number;
}): Promise<IngredientEvidence[]> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return [];
    throw err;
  }

  const { data, error } = await supabase
    .from("clinical_evidence")
    .select(
      "id, source, source_ref, title_en, summary_vn, summary_en, tier, citation_url, published_at"
    )
    .eq("ingredient_id", input.ingredientId)
    .order("tier", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(input.limit ?? 5);
  if (error || !data) {
    if (error) console.error("[listEvidenceByIngredient] query failed:", error);
    return [];
  }

  type Row = {
    id: string;
    source: string;
    source_ref: string;
    title_en: string;
    summary_vn: string | null;
    summary_en: string | null;
    tier: "A" | "B" | "C" | "D";
    citation_url: string;
    published_at: string | null;
  };

  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    title: r.title_en,
    summary: pickLocale(r, "summary", input.locale),
    source: r.source,
    sourceRef: r.source_ref,
    tier: r.tier,
    citationUrl: r.citation_url,
    publishedAt: r.published_at,
  }));
}

export type IngredientVariant = {
  slug: string;
  name: string;
  description: string | null;
  productCount: number;
};

/**
 * Direct child ingredients (derivatives / forms) of a parent
 * molecule, sorted by product count desc then name. Used by the
 * ingredient page's "Variants & forms" section.
 */
export async function listIngredientVariants(input: {
  parentIngredientId: string;
  locale: Locale;
}): Promise<IngredientVariant[]> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return [];
    throw err;
  }

  const { data: rows, error } = await supabase
    .from("ingredients")
    .select(
      "id, slug, name_vn, name_en, description_vn, description_en"
    )
    .eq("parent_ingredient_id", input.parentIngredientId);
  if (error || !rows || rows.length === 0) {
    if (error) console.error("[listIngredientVariants] query failed:", error);
    return [];
  }

  type Row = {
    id: string;
    slug: string;
    name_vn: string | null;
    name_en: string;
    description_vn: string | null;
    description_en: string | null;
  };
  const ingRows = rows as unknown as Row[];

  // One small fan-out to count linked supplements per variant.
  // Variants are a tight set (typically 1–5 per molecule) so per-row
  // count queries don't hurt; if this ever scales out we can swap to
  // a single grouped count.
  const counts = await Promise.all(
    ingRows.map(async (r) => {
      const { count } = await supabase
        .from("supplement_ingredients")
        .select("supplement_id", { count: "exact", head: true })
        .eq("ingredient_id", r.id);
      return [r.id, count ?? 0] as const;
    })
  );
  const countMap = new Map(counts);

  const out: IngredientVariant[] = ingRows.map((r) => ({
    slug: r.slug,
    name: pickLocale(r, "name", input.locale),
    description: pickLocale(r, "description", input.locale) || null,
    productCount: countMap.get(r.id) ?? 0,
  }));

  out.sort((a, b) => {
    if (b.productCount !== a.productCount) return b.productCount - a.productCount;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/**
 * Canonical ingredient detail page: ingredient row + (optional)
 * bilingual page body + ranked products containing it + top clinical
 * evidence rows + parent molecule (when this is a derivative) +
 * derivative variants (when this is a parent molecule).
 *
 * Returns `null` only when the slug doesn't resolve to an ingredient.
 * Ingredients without an authored `ingredient_pages` row still render
 * — we just hide the body section. This avoids 404s from search /
 * cross-link traffic for ingredients we have data on but haven't
 * written long-form content for yet.
 */
export async function getIngredientPageBySlug(input: {
  slug: string;
  locale: Locale;
}): Promise<{
  ingredient: {
    id: string;
    slug: string;
    name: string;
    category: string;
    description: string | null;
    safetyNotes: string | null;
    typicalDoseMin: number | null;
    typicalDoseMax: number | null;
    typicalUnit: string | null;
  };
  parent: { slug: string; name: string } | null;
  variants: IngredientVariant[];
  page: {
    body: string;
    kol: string | null;
    publishedAt: string;
    updatedAt: string;
  } | null;
  imageUrl: string | null;
  supplements: RankedSupplement[];
  evidence: IngredientEvidence[];
} | null> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return null;
    throw err;
  }

  const { data: ingRow, error: ingErr } = await supabase
    .from("ingredients")
    .select(
      "id, slug, name_vn, name_en, category, description_vn, description_en, safety_notes_vn, safety_notes_en, typical_dose_min, typical_dose_max, typical_unit, parent_ingredient_id"
    )
    .eq("slug", input.slug)
    .maybeSingle();
  if (ingErr) {
    console.error("[getIngredientPageBySlug] ingredient query failed:", ingErr);
    return null;
  }
  if (!ingRow) return null;

  type IngFullRow = {
    id: string;
    slug: string;
    name_vn: string | null;
    name_en: string;
    category: string;
    description_vn: string | null;
    description_en: string | null;
    safety_notes_vn: string | null;
    safety_notes_en: string | null;
    typical_dose_min: number | null;
    typical_dose_max: number | null;
    typical_unit: string | null;
    parent_ingredient_id: string | null;
  };
  const ing = ingRow as unknown as IngFullRow;

  const { data: pageRow, error: pageErr } = await supabase
    .from("ingredient_pages")
    .select("body_vn, body_en, kol, published_at, updated_at, image_url")
    .eq("ingredient_id", ing.id)
    .maybeSingle();
  if (pageErr) {
    console.error("[getIngredientPageBySlug] page query failed:", pageErr);
  }

  type PageRow = {
    body_vn: string | null;
    body_en: string | null;
    kol: string | null;
    published_at: string;
    updated_at: string;
    image_url: string | null;
  };
  const page = (pageRow ?? null) as PageRow | null;

  // Fan out the per-ingredient queries in parallel: products + evidence
  // are always relevant; parent + variants depend on which side of the
  // hierarchy this ingredient sits on. We fire all four; the parent
  // lookup is a single .eq() and the variants lookup is a single .eq()
  // so the cost is negligible even when the result is empty.
  const [supplements, evidence, parentRow, variants] = await Promise.all([
    listSupplementsByIngredientId({ ingredientId: ing.id, locale: input.locale }),
    listEvidenceByIngredient({ ingredientId: ing.id, locale: input.locale }),
    ing.parent_ingredient_id
      ? supabase
          .from("ingredients")
          .select("slug, name_vn, name_en")
          .eq("id", ing.parent_ingredient_id)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) console.error("[getIngredientPageBySlug] parent query failed:", error);
            return data;
          })
      : Promise.resolve(null),
    listIngredientVariants({ parentIngredientId: ing.id, locale: input.locale }),
  ]);

  const body = page ? pickLocale(page, "body", input.locale) : "";

  type ParentRow = { slug: string; name_vn: string | null; name_en: string };
  const parent = parentRow
    ? {
        slug: (parentRow as unknown as ParentRow).slug,
        name: pickLocale(parentRow as unknown as ParentRow, "name", input.locale),
      }
    : null;

  return {
    ingredient: {
      id: ing.id,
      slug: ing.slug,
      name: pickLocale(ing, "name", input.locale),
      category: ing.category,
      description: pickLocale(ing, "description", input.locale) || null,
      safetyNotes: pickLocale(ing, "safety_notes", input.locale) || null,
      typicalDoseMin: ing.typical_dose_min,
      typicalDoseMax: ing.typical_dose_max,
      typicalUnit: ing.typical_unit,
    },
    parent,
    variants,
    page:
      page && body
        ? {
            body,
            kol: page.kol,
            publishedAt: page.published_at,
            updatedAt: page.updated_at,
          }
        : null,
    imageUrl: page?.image_url ?? null,
    supplements,
    evidence,
  };
}

type ArticleRow = {
  id: string;
  slug: string;
  title_vn: string | null;
  title_en: string;
  body_vn: string | null;
  body_en: string | null;
  kol: string | null;
  video_url: string | null;
  published_at: string;
};

export async function listArticles(input: {
  locale: Locale;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    slug: string;
    title: string;
    body: string;
    kol: string | null;
    videoUrl: string | null;
    publishedAt: string;
  }>
> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return [];
    throw err;
  }

  const { data, error } = await supabase
    .from("articles")
    .select(
      "id, slug, title_vn, title_en, body_vn, body_en, kol, video_url, published_at"
    )
    .order("published_at", { ascending: false })
    .limit(input.limit ?? 20);
  if (error) {
    console.error("[listArticles] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as ArticleRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: pickLocale(row, "title", input.locale),
    // Only the first ~280 chars are needed for the feed preview;
    // article detail pages will fetch the full body separately.
    body: pickLocale(row, "body", input.locale).slice(
      0,
      ARTICLE_BODY_PREVIEW_CHARS
    ),
    kol: row.kol,
    videoUrl: row.video_url,
    publishedAt: row.published_at,
  }));
}
