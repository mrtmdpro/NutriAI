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
  let ingQuery = supabase
    .from("ingredients")
    .select(
      `id, slug, name_vn, name_en, category, description_vn, description_en`
    )
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

/**
 * Fetch a single article by slug, with the ingredient/supplement it
 * links to (if any). Used by /[locale]/articles/[slug].
 */
export async function getArticleBySlug(input: {
  slug: string;
  locale: Locale;
}): Promise<{
  id: string;
  slug: string;
  title: string;
  body: string;
  kol: string | null;
  videoUrl: string | null;
  publishedAt: string;
  ingredientSlug: string | null;
  ingredientName: string | null;
  supplementSlug: string | null;
} | null> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return null;
    throw err;
  }

  const { data, error } = await supabase
    .from("articles")
    .select(
      `
      id, slug, title_vn, title_en, body_vn, body_en, kol, video_url, published_at,
      ingredients ( slug, name_vn, name_en ),
      supplements ( slug )
    `
    )
    .eq("slug", input.slug)
    .maybeSingle();
  if (error) {
    console.error("[getArticleBySlug] query failed:", error);
    return null;
  }
  if (!data) return null;

  type Row = {
    id: string;
    slug: string;
    title_vn: string | null;
    title_en: string;
    body_vn: string | null;
    body_en: string | null;
    kol: string | null;
    video_url: string | null;
    published_at: string;
    ingredients:
      | { slug: string; name_vn: string | null; name_en: string }
      | { slug: string; name_vn: string | null; name_en: string }[]
      | null;
    supplements: { slug: string } | { slug: string }[] | null;
  };
  const row = data as unknown as Row;
  const ing = Array.isArray(row.ingredients) ? row.ingredients[0] ?? null : row.ingredients;
  const sup = Array.isArray(row.supplements) ? row.supplements[0] ?? null : row.supplements;

  return {
    id: row.id,
    slug: row.slug,
    title: pickLocale(row, "title", input.locale),
    body: pickLocale(row, "body", input.locale),
    kol: row.kol,
    videoUrl: row.video_url,
    publishedAt: row.published_at,
    ingredientSlug: ing?.slug ?? null,
    ingredientName: ing ? pickLocale(ing, "name", input.locale) : null,
    supplementSlug: sup?.slug ?? null,
  };
}

/**
 * Rank all supplements that contain a given ingredient (or any
 * ingredient whose slug starts with the given prefix — e.g. passing
 * "creatine" matches "creatine" + "creatine-hcl"). Used by the article
 * page's ranking section.
 */
export async function listSupplementsByIngredientSlug(input: {
  ingredientSlugPrefix: string;
  locale: Locale;
}): Promise<
  Array<{
    slug: string;
    name: string;
    brand: string;
    form: string | null;
    description: string | null;
    priceVnd: number | null;
    qualityTier: "S" | "A" | "B" | "C" | null;
    qualityTotal: number | null;
    qualityLab: number | null;
    qualityIngredient: number | null;
    qualityPrice: number | null;
    notes: string | null;
  }>
> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    if (isMissingEnvError(err)) return [];
    throw err;
  }

  // Fetch ingredient ids with the prefix (handles e.g. creatine + creatine-hcl).
  const { data: ings, error: ingErr } = await supabase
    .from("ingredients")
    .select("id, slug")
    .or(
      `slug.eq.${input.ingredientSlugPrefix},slug.like.${input.ingredientSlugPrefix}-%`
    );
  if (ingErr || !ings || ings.length === 0) {
    if (ingErr) console.error("[listSupplementsByIngredientSlug] ing query failed:", ingErr);
    return [];
  }
  const ingredientIds = ings.map((i) => i.id as string);

  const { data: links, error: linkErr } = await supabase
    .from("supplement_ingredients")
    .select("supplement_id")
    .in("ingredient_id", ingredientIds);
  if (linkErr || !links) {
    if (linkErr) console.error("[listSupplementsByIngredientSlug] link query failed:", linkErr);
    return [];
  }
  const supplementIds = Array.from(
    new Set(links.map((l) => l.supplement_id as string))
  );
  if (supplementIds.length === 0) return [];

  const { data: rows, error } = await supabase
    .from("supplements")
    .select(
      `
      slug, name_vn, name_en, brand, form, description_vn, description_en, price_vnd,
      quality_index ( tier, total_score, lab_test_score, ingredient_quality_score, price_per_dose_score, notes )
    `
    )
    .in("id", supplementIds);
  if (error || !rows) {
    if (error) console.error("[listSupplementsByIngredientSlug] supp query failed:", error);
    return [];
  }

  type SuppRow = {
    slug: string;
    brand: string;
    form: string | null;
    price_vnd: number | null;
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

  const out = (rows as unknown as SuppRow[]).map((row) => {
    const qiRaw = row.quality_index;
    const qi = Array.isArray(qiRaw) ? qiRaw[0] : qiRaw;
    return {
      slug: row.slug,
      name: pickLocale(row, "name", input.locale),
      brand: row.brand,
      form: row.form,
      description: pickLocale(row, "description", input.locale) || null,
      priceVnd: row.price_vnd,
      qualityTier: qi?.tier ?? null,
      qualityTotal: qi?.total_score ?? null,
      qualityLab: qi?.lab_test_score ?? null,
      qualityIngredient: qi?.ingredient_quality_score ?? null,
      qualityPrice: qi?.price_per_dose_score ?? null,
      notes: qi?.notes ?? null,
    };
  });

  // Sort: ranked supplements first (by total_score desc), unranked last.
  out.sort((a, b) => {
    const at = a.qualityTotal ?? -1;
    const bt = b.qualityTotal ?? -1;
    if (at !== bt) return bt - at;
    return a.name.localeCompare(b.name);
  });
  return out;
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
