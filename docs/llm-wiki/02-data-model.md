# 02 — Data model

Migrations live in [`supabase/migrations/`](../../supabase/migrations/) and
are applied via the Supabase CLI (or the dashboard). Hand-authored
TypeScript types in
[`lib/supabase/database.types.ts`](../../lib/supabase/database.types.ts)
mirror the schema and will be replaced by `npm run db:types` once the
project is linked.

## Sprint 1 tables

### `public.profiles`

1:1 with `auth.users.id`. Auto-provisioned by the
`on_auth_user_created` trigger on `auth.users` insert.

| Column      | Type        | Notes                                              |
| ----------- | ----------- | -------------------------------------------------- |
| `id`        | uuid (PK)   | FK → `auth.users.id`, on delete cascade            |
| `email`     | text        | Mirror of `auth.users.email`                       |
| `locale`    | text        | `vi` \| `en`. Default `vi`. Read from user meta.   |
| `plan`      | text        | `free` \| `pro`. Default `free`.                   |
| `pro_until` | timestamptz | Expires-at for Pro subscriptions (null = free).    |
| `created_at`| timestamptz | now()                                               |
| `updated_at`| timestamptz | refreshed by `tg_set_updated_at` BEFORE UPDATE     |

RLS: enabled. Self-only `SELECT` and `UPDATE` policies. Column-level
GRANT (migration 0002) restricts client UPDATE to `locale` only —
`plan` and `pro_until` are mutable only via the service-role client
(payment webhook).

## Sprint 2 tables (Knowledge Hub — BR1)

### `public.ingredients`

Compound-level entries (e.g. "Magnesium glycinate", "Vitamin D3").

| Column                | Type             | Notes                                |
| --------------------- | ---------------- | ------------------------------------ |
| `id`                  | uuid (PK)        | `gen_random_uuid()`                  |
| `slug`                | text UNIQUE      | URL-safe, derived from `name_en`     |
| `name_vn`, `name_en`  | text             | Bilingual                            |
| `iupac_name`          | text             | Optional canonical chemistry name    |
| `category`            | text             | vitamin / mineral / omega / etc.     |
| `description_vn/en`   | text             | Bilingual narrative                  |
| `safety_notes_vn/en`  | text             | Contraindications, max dose          |
| `typical_dose_*`      | numeric / text   | min / max / unit                     |
| `embedding`           | vector(1536)     | HNSW indexed, cosine distance        |
| `search_vector`       | tsvector (gen.)  | GIN indexed                          |

### `public.supplements`

Brand-level products (e.g. "NOW Magnesium Glycinate 200mg, 90 caps").

Fields mirror DSLD: `slug` (`dsld-<id>`), `brand`, `form`,
`net_quantity`, optional `price_vnd`, bilingual name + description,
embedding-free (the supplement-level embedding lives implicitly on its
ingredients + evidence). FTS via `search_vector`.

### `public.supplement_ingredients`

M:N join. PK is `(supplement_id, ingredient_id)`. Stores `dose`, `unit`,
`pct_daily_value`.

### `public.clinical_evidence`

Per-ingredient cited evidence. Sources enumerated as `pubmed | ods |
openfda`. Tier = `A | B | C | D` matching meta-analysis / RCT /
observational / other. UNIQUE on `(source, source_ref)` — re-running
the cron is a no-op.

### `public.articles`

Editorial + KOL content. Optionally tagged to a `supplement` or
`ingredient`. Bilingual title + body. Has an embedding for RAG retrieval.

### `public.quality_index`

Per-supplement scoring. Three components, each capped:

| Column                     | Range   |
| -------------------------- | ------- |
| `lab_test_score`           | [0, 40] |
| `ingredient_quality_score` | [0, 30] |
| `price_per_dose_score`     | [0, 30] |
| `total_score` (generated)  | [0,100] |

Tier mapping (`public.tier_for_score(total)`):
- ≥ 85 → S
- ≥ 70 → A
- ≥ 55 → B
- otherwise C

The TypeScript implementation in
[`lib/knowledge/scoring.ts`](../../lib/knowledge/scoring.ts) mirrors the
SQL function so cron jobs and the UI agree.

## Public-read RLS

All Knowledge Hub tables are public-read. RLS is enabled with
`select using (true)` policies; writes are reserved for the
service-role client (cron handlers, manual seeds).

## Indexes

- GIN on every `search_vector` for full-text search
- `pg_trgm` GIN on `name_en`, `name_vn`, `brand` for typo-tolerant
  prefix search
- HNSW on every `embedding` column for cosine similarity
- B-tree on `category`, `tier`, `published_at`, `total_score`
- Reverse-lookup index on `supplement_ingredients(ingredient_id)`
