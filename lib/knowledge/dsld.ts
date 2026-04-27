import "server-only";

/**
 * NIH ODS Dietary Supplement Label Database (DSLD) client.
 *
 * v9 API at https://api.ods.od.nih.gov/dsld/v9.
 *
 *   - GET /search-filter?q=<term>&size=<n>
 *       → { hits: Array<{_id, _score, _source: { fullName, brandName, ... }}>, stats }
 *
 *   - GET /label/{id}
 *       → { id, fullName, brandName, productType: {langualCodeDescription},
 *           netContents: Array<{quantity, unit}>, ingredientRows: Array<{name,
 *           quantity: Array<{quantity, unit, dailyValueTargetGroup: [{percent}]}>}>,
 *           offMarket: 0|1, ... }
 *
 * No API key is required. We rate-limit ourselves to ~2 req/s and skip
 * `offMarket = 1` rows so the Knowledge Hub never carries discontinued
 * SKUs.
 */

const DSLD_BASE = "https://api.ods.od.nih.gov/dsld/v9";

export type DsldSearchHit = {
  dsldId: string;
  fullName: string;
  brandName?: string;
  productType?: string;
  offMarket: boolean;
};

export type DsldLabelIngredient = {
  name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  dailyValuePct?: number;
};

export type DsldLabel = {
  dsldId: string;
  fullName: string;
  brandName?: string;
  productType?: string;
  form?: string;
  netContent?: string;
  ingredients: DsldLabelIngredient[];
  offMarket: boolean;
  url: string;
};

async function dsldFetch(path: string): Promise<unknown> {
  const res = await fetch(`${DSLD_BASE}${path}`, {
    headers: { Accept: "application/json" },
    // DSLD updates infrequently (weekly cadence). Cache responses in
    // Vercel's data cache for 24h to cut external load on re-runs.
    next: { revalidate: 86_400 },
  });
  if (!res.ok) {
    throw new Error(`DSLD ${path} → ${res.status}`);
  }
  return res.json();
}

type DsldHit = {
  _id?: string | number;
  _source?: {
    fullName?: string;
    brandName?: string;
    productType?: { langualCodeDescription?: string } | string;
    offMarket?: number;
  };
};

function readProductType(
  raw: { langualCodeDescription?: string } | string | undefined
): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  return raw.langualCodeDescription;
}

export async function searchDsld(
  query: string,
  limit = 5
): Promise<DsldSearchHit[]> {
  const params = new URLSearchParams({
    q: query,
    size: String(limit),
    // Server-side filter to on-market labels.
    status_market: "1",
  });
  const data = (await dsldFetch(`/search-filter?${params.toString()}`)) as {
    hits?: DsldHit[];
  };
  const hits = data?.hits ?? [];
  return hits
    .map((hit): DsldSearchHit | null => {
      const id = hit._id != null ? String(hit._id) : null;
      const src = hit._source ?? {};
      if (!id || !src.fullName) return null;
      const offMarket = src.offMarket === 1;
      if (offMarket) return null;
      return {
        dsldId: id,
        fullName: src.fullName,
        brandName: src.brandName,
        productType: readProductType(src.productType),
        offMarket,
      };
    })
    .filter((h): h is DsldSearchHit => h !== null);
}

type DsldIngredientRow = {
  name?: string;
  category?: string;
  quantity?: Array<{
    quantity?: number;
    unit?: string;
    dailyValueTargetGroup?: Array<{ percent?: number }>;
  }>;
};

type DsldLabelResponse = {
  id?: number | string;
  fullName?: string;
  brandName?: string;
  productType?: { langualCodeDescription?: string } | string;
  physicalState?: { langualCodeDescription?: string } | string;
  netContents?: Array<{ display?: string; quantity?: number; unit?: string }>;
  ingredientRows?: DsldIngredientRow[];
  offMarket?: number;
};

export async function getDsldLabel(dsldId: string): Promise<DsldLabel | null> {
  let data: DsldLabelResponse | null;
  try {
    data = (await dsldFetch(
      `/label/${encodeURIComponent(dsldId)}`
    )) as DsldLabelResponse | null;
  } catch (err) {
    console.error(`[dsld] label ${dsldId} failed:`, err);
    return null;
  }
  if (!data || !data.fullName) return null;

  const offMarket = data.offMarket === 1;
  if (offMarket) return null;

  const physicalState =
    typeof data.physicalState === "string"
      ? data.physicalState
      : data.physicalState?.langualCodeDescription;

  const netContent = data.netContents?.[0]?.display;

  const ingredients: DsldLabelIngredient[] = (data.ingredientRows ?? [])
    .map((row): DsldLabelIngredient | null => {
      const name = (row.name ?? "").trim();
      if (!name) return null;
      const first = row.quantity?.[0];
      const dvPct = first?.dailyValueTargetGroup?.[0]?.percent;
      return {
        name,
        category: row.category,
        quantity: typeof first?.quantity === "number" ? first.quantity : undefined,
        unit: first?.unit,
        dailyValuePct: typeof dvPct === "number" ? dvPct : undefined,
      };
    })
    .filter((x): x is DsldLabelIngredient => x !== null);

  return {
    dsldId,
    fullName: data.fullName,
    brandName: data.brandName,
    productType: readProductType(data.productType),
    form: physicalState,
    netContent,
    ingredients,
    offMarket,
    url: `https://dsld.od.nih.gov/label/${encodeURIComponent(dsldId)}`,
  };
}

/** Top Vietnamese-consumer supplement queries to seed BR1. */
export const SEED_QUERIES: readonly string[] = [
  "vitamin d3",
  "magnesium glycinate",
  "omega-3 fish oil",
  "probiotic",
  "vitamin c",
  "zinc",
  "vitamin b complex",
  "iron",
  "calcium",
  "collagen peptides",
  "ashwagandha",
  "creatine monohydrate",
  "whey protein isolate",
  "melatonin",
  "coq10",
  "vitamin k2",
  "biotin",
  "turmeric curcumin",
  "glucosamine",
  "berberine",
];
