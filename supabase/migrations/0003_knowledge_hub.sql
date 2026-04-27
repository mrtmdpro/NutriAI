-- Sprint 2: Knowledge Hub data layer (BR1).
--
-- Tables:
--   ingredients              — compound-level entries with bilingual descriptions
--   supplements              — brand-level products
--   supplement_ingredients   — M:N join between supplements and ingredients
--   clinical_evidence        — peer-reviewed evidence per ingredient
--   articles                 — editorial / KOL content
--   quality_index            — per-supplement scoring + tier
--
-- All tables include a generated `search_vector` (tsvector) for full-text
-- search and an HNSW-indexed `embedding` (vector(1536)) for semantic search.
-- The hybrid retrieval used by /search and the RAG assistant unions BM25-like
-- FTS with cosine similarity; scoring is implemented in Sprint 3+.

-- Extensions land in the dedicated `extensions` schema per Supabase
-- convention. Supabase's default search_path includes `extensions` for
-- the postgres + authenticated roles, so unqualified references to
-- `vector`, `gen_random_uuid`, etc. continue to resolve.
create schema if not exists extensions;
create extension if not exists "vector"   with schema extensions;
create extension if not exists "pg_trgm"  with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- The Supabase migration runner uses a tighter search_path than the
-- runtime DB roles, so `vector`, `gin_trgm_ops`, and `vector_cosine_ops`
-- aren't visible by default. Add `extensions` for this transaction so
-- column types and operator classes resolve without schema-qualifying
-- every reference.
set local search_path = public, extensions;

-- Re-state the timestamp helper from 0001 so this migration is
-- self-contained when replayed in isolation. `create or replace` is
-- idempotent and won't conflict with the original definition.
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

----------------------------------------------------------------------
-- Enums
----------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'evidence_source') then
    create type evidence_source as enum ('pubmed', 'ods', 'openfda');
  end if;
  if not exists (select 1 from pg_type where typname = 'evidence_tier') then
    -- A: meta-analysis / systematic review
    -- B: randomized controlled trial
    -- C: observational / cohort
    -- D: in-vitro / animal / case report
    create type evidence_tier as enum ('A', 'B', 'C', 'D');
  end if;
  if not exists (select 1 from pg_type where typname = 'quality_tier') then
    create type quality_tier as enum ('S', 'A', 'B', 'C');
  end if;
end$$;

----------------------------------------------------------------------
-- ingredients
----------------------------------------------------------------------

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_vn text,
  name_en text not null,
  iupac_name text,
  category text not null,
  description_vn text,
  description_en text,
  safety_notes_vn text,
  safety_notes_en text,
  typical_dose_min numeric,
  typical_dose_max numeric,
  typical_unit text,
  embedding vector(1536),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name_vn, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(name_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(iupac_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description_vn, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(description_en, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ingredients_search_idx on public.ingredients using gin (search_vector);
create index if not exists ingredients_trgm_idx on public.ingredients using gin (name_en gin_trgm_ops, name_vn gin_trgm_ops);
create index if not exists ingredients_embedding_idx on public.ingredients using hnsw (embedding vector_cosine_ops);
create index if not exists ingredients_category_idx on public.ingredients (category);

drop trigger if exists set_updated_at on public.ingredients;
create trigger set_updated_at before update on public.ingredients
  for each row execute function public.tg_set_updated_at();

----------------------------------------------------------------------
-- supplements
----------------------------------------------------------------------

create table if not exists public.supplements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_vn text,
  name_en text not null,
  brand text not null,
  form text,
  net_quantity text,
  description_vn text,
  description_en text,
  -- Anchor URL (manufacturer or marketplace listing) for traceability.
  source_url text,
  -- Latest known retail price in VND, refreshed by a follow-up job.
  price_vnd integer,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name_vn, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(name_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description_vn, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(description_en, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplements_search_idx on public.supplements using gin (search_vector);
create index if not exists supplements_trgm_idx on public.supplements using gin (name_en gin_trgm_ops, name_vn gin_trgm_ops, brand gin_trgm_ops);
create index if not exists supplements_brand_idx on public.supplements (brand);

drop trigger if exists set_updated_at on public.supplements;
create trigger set_updated_at before update on public.supplements
  for each row execute function public.tg_set_updated_at();

----------------------------------------------------------------------
-- supplement_ingredients (M:N)
----------------------------------------------------------------------

create table if not exists public.supplement_ingredients (
  supplement_id uuid not null references public.supplements (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  dose numeric not null,
  unit text not null,
  pct_daily_value numeric,
  primary key (supplement_id, ingredient_id)
);

create index if not exists supplement_ingredients_ingredient_idx
  on public.supplement_ingredients (ingredient_id);

----------------------------------------------------------------------
-- clinical_evidence
----------------------------------------------------------------------

create table if not exists public.clinical_evidence (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  source evidence_source not null,
  source_ref text not null,            -- PubMed PMID, ODS doc id, etc.
  title_en text not null,
  summary_vn text,
  summary_en text,
  tier evidence_tier not null default 'C',
  citation_url text not null,
  published_at date,
  embedding vector(1536),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(summary_vn, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(summary_en, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  unique (source, source_ref)
);

create index if not exists clinical_evidence_search_idx on public.clinical_evidence using gin (search_vector);
create index if not exists clinical_evidence_embedding_idx on public.clinical_evidence using hnsw (embedding vector_cosine_ops);
create index if not exists clinical_evidence_ingredient_idx on public.clinical_evidence (ingredient_id);
create index if not exists clinical_evidence_tier_idx on public.clinical_evidence (tier);

----------------------------------------------------------------------
-- articles
----------------------------------------------------------------------

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title_vn text,
  title_en text not null,
  body_vn text,
  body_en text,
  kol text,
  video_url text,
  supplement_id uuid references public.supplements (id) on delete set null,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  embedding vector(1536),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title_vn, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(title_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(kol, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(body_vn, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(body_en, '')), 'C')
  ) stored,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_search_idx on public.articles using gin (search_vector);
create index if not exists articles_embedding_idx on public.articles using hnsw (embedding vector_cosine_ops);
create index if not exists articles_supplement_idx on public.articles (supplement_id);
create index if not exists articles_ingredient_idx on public.articles (ingredient_id);
create index if not exists articles_published_idx on public.articles (published_at desc);

drop trigger if exists set_updated_at on public.articles;
create trigger set_updated_at before update on public.articles
  for each row execute function public.tg_set_updated_at();

----------------------------------------------------------------------
-- quality_index
----------------------------------------------------------------------

create table if not exists public.quality_index (
  supplement_id uuid primary key references public.supplements (id) on delete cascade,
  -- Components are bounded so the total falls in [0, 100].
  lab_test_score numeric not null check (lab_test_score between 0 and 40),
  ingredient_quality_score numeric not null check (ingredient_quality_score between 0 and 30),
  price_per_dose_score numeric not null check (price_per_dose_score between 0 and 30),
  total_score numeric generated always as (
    lab_test_score + ingredient_quality_score + price_per_dose_score
  ) stored,
  -- `tier` is filled in by the BEFORE-INSERT/UPDATE trigger below if
  -- the writer leaves it null. lib/knowledge/scoring.ts may also set
  -- it explicitly; either path is valid.
  tier quality_tier,
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists quality_index_tier_idx on public.quality_index (tier);
create index if not exists quality_index_total_idx on public.quality_index (total_score desc);

drop trigger if exists set_updated_at on public.quality_index;
create trigger set_updated_at before update on public.quality_index
  for each row execute function public.tg_set_updated_at();

----------------------------------------------------------------------
-- Tier classification helper
----------------------------------------------------------------------
--
-- Centralizes the mapping from total_score → tier. ETL writes the tier
-- explicitly so we can grandfather a manual override if needed; this
-- function exists for the canonical default mapping.

create or replace function public.tier_for_score(total numeric)
returns quality_tier
language sql
immutable
as $$
  select case
    when total >= 85 then 'S'::quality_tier
    when total >= 70 then 'A'::quality_tier
    when total >= 55 then 'B'::quality_tier
    else 'C'::quality_tier
  end;
$$;

-- Auto-fill `tier` from the component scores when the writer doesn't
-- override it. Generated columns can't reference each other in
-- Postgres, so we use a BEFORE trigger.
create or replace function public.tg_quality_index_default_tier()
returns trigger
language plpgsql
as $$
begin
  if new.tier is null then
    new.tier := public.tier_for_score(
      new.lab_test_score + new.ingredient_quality_score + new.price_per_dose_score
    );
  end if;
  return new;
end;
$$;

drop trigger if exists default_tier on public.quality_index;
create trigger default_tier
  before insert or update on public.quality_index
  for each row execute function public.tg_quality_index_default_tier();

----------------------------------------------------------------------
-- Public-read RLS
----------------------------------------------------------------------
-- The Knowledge Hub is public. We enable RLS to be explicit and add
-- read-anyone policies; writes are restricted to the service-role
-- client (cron, manual seeding) which bypasses RLS.

alter table public.ingredients enable row level security;
alter table public.supplements enable row level security;
alter table public.supplement_ingredients enable row level security;
alter table public.clinical_evidence enable row level security;
alter table public.articles enable row level security;
alter table public.quality_index enable row level security;

drop policy if exists "ingredients_read_all" on public.ingredients;
create policy "ingredients_read_all" on public.ingredients for select using (true);

drop policy if exists "supplements_read_all" on public.supplements;
create policy "supplements_read_all" on public.supplements for select using (true);

drop policy if exists "supplement_ingredients_read_all" on public.supplement_ingredients;
create policy "supplement_ingredients_read_all" on public.supplement_ingredients for select using (true);

drop policy if exists "clinical_evidence_read_all" on public.clinical_evidence;
create policy "clinical_evidence_read_all" on public.clinical_evidence for select using (true);

drop policy if exists "articles_read_all" on public.articles;
create policy "articles_read_all" on public.articles for select using (true);

drop policy if exists "quality_index_read_all" on public.quality_index;
create policy "quality_index_read_all" on public.quality_index for select using (true);

comment on table public.ingredients is 'BR1 Knowledge Hub: compound-level entries with bilingual descriptions and embeddings.';
comment on table public.supplements is 'BR1 Knowledge Hub: brand-level products linking to one or more ingredients.';
comment on table public.clinical_evidence is 'BR1 Knowledge Hub: per-ingredient cited evidence (pubmed/ods/openfda).';
comment on table public.articles is 'BR1 Knowledge Hub: editorial + KOL content, optionally tagged to supplement/ingredient.';
comment on table public.quality_index is 'BR1 Quality Index: tiered ranking with lab/ingredient/price components.';
