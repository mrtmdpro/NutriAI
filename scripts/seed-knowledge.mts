/**
 * Local-run seed for the Knowledge Hub — bypasses AI Gateway / OpenAI.
 *
 * Pulls DSLD labels and inserts them into Supabase as English-only rows
 * (no bilingual translation, no embeddings). The UI's pickLocale helper
 * falls back to English when name_vn / description_vn are null, so the
 * Knowledge Hub renders fine — just monolingual until billing is in
 * place and the AI-powered cron (`ingest-dsld`) can fill in the gaps.
 *
 * Run with:
 *   vercel env pull .env.local                # pulls SUPABASE_URL + service role key
 *   npx tsx --env-file=.env.local scripts/seed-knowledge.mts
 *
 * Idempotent on slug = "dsld-<id>". Re-running upserts in place.
 */
import { createClient } from "@supabase/supabase-js";
import {
  searchDsld,
  getDsldLabel,
  SEED_QUERIES,
  type DsldLabel,
} from "../lib/knowledge/dsld.js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Run: vercel env pull .env.local"
  );
  process.exit(1);
}

const HITS_PER_QUERY = 3;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function ensureIngredient(input: {
  nameEn: string;
  category: string;
}): Promise<string> {
  const slug = slugify(input.nameEn);
  const { data, error } = await supabase
    .from("ingredients")
    .upsert(
      { slug, name_en: input.nameEn, category: input.category },
      { onConflict: "slug", ignoreDuplicates: false }
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`ingredient ${slug}: ${error?.message}`);
  return data.id as string;
}

async function upsertSupplement(label: DsldLabel): Promise<{ created: boolean }> {
  const slug = `dsld-${label.dsldId}`;

  const { data: existing } = await supabase
    .from("supplements")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  const wasNew = !existing;

  const { data: upserted, error: suppErr } = await supabase
    .from("supplements")
    .upsert(
      {
        slug,
        name_en: label.fullName,
        // name_vn intentionally null — fallback to name_en in UI.
        brand: label.brandName ?? "Unknown",
        form: label.form ?? null,
        net_quantity: label.netContent ?? null,
        description_en: [
          label.fullName,
          label.brandName ? `by ${label.brandName}` : "",
          label.productType ?? "",
        ]
          .filter(Boolean)
          .join(". "),
        source_url: label.url,
      },
      { onConflict: "slug", ignoreDuplicates: false }
    )
    .select("id")
    .single();
  if (suppErr || !upserted) {
    throw new Error(`supplement ${slug}: ${suppErr?.message}`);
  }
  const supplementId = upserted.id as string;

  for (const ing of label.ingredients) {
    if (!ing.name) continue;
    if (ing.quantity == null || !ing.unit) continue;
    try {
      const ingredientId = await ensureIngredient({
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
      if (error) console.warn(`  link ${ing.name}: ${error.message}`);
    } catch (err) {
      console.warn(`  ingredient ${ing.name}: ${(err as Error).message}`);
    }
  }
  return { created: wasNew };
}

async function main() {
  const stats = {
    queries: 0,
    hits: 0,
    supplements_created: 0,
    supplements_existing: 0,
    errors: 0,
  };

  for (const query of SEED_QUERIES) {
    stats.queries += 1;
    process.stdout.write(`→ ${query.padEnd(28)} `);
    try {
      const hits = await searchDsld(query, HITS_PER_QUERY);
      stats.hits += hits.length;
      let created = 0;
      let existing = 0;
      for (const hit of hits) {
        try {
          const label = await getDsldLabel(hit.dsldId);
          if (!label) continue;
          const { created: isNew } = await upsertSupplement(label);
          if (isNew) created += 1;
          else existing += 1;
        } catch (err) {
          stats.errors += 1;
          console.error(`\n  ✗ ${hit.dsldId}: ${(err as Error).message}`);
        }
      }
      stats.supplements_created += created;
      stats.supplements_existing += existing;
      console.log(
        `${hits.length} hits → ${created} new, ${existing} existing`
      );
    } catch (err) {
      stats.errors += 1;
      console.error(`\n  ✗ query "${query}": ${(err as Error).message}`);
    }
  }

  console.log("\nDone.", JSON.stringify(stats, null, 2));

  // Also count what's in the DB now.
  const { count: ingCount } = await supabase
    .from("ingredients")
    .select("*", { count: "exact", head: true });
  const { count: suppCount } = await supabase
    .from("supplements")
    .select("*", { count: "exact", head: true });
  console.log(
    `Live counts: supplements=${suppCount ?? 0}, ingredients=${ingCount ?? 0}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
