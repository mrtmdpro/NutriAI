-- Sprint 8: Canonical ingredient detail pages.
--
-- ingredient_pages holds the rich bilingual educational body for each
-- ingredient. It's 1:1 with ingredients (PK = ingredient_id, cascade
-- on delete) so the relationship is enforced at the schema level and
-- there's no risk of "two pages for one ingredient" drift.
--
-- This is intentionally separate from `articles` because the two have
-- different intents:
--   ingredient_pages = canonical, reference-style educational content
--                      (what the user reads when they want to learn
--                      about creatine, vitamin D, magnesium, etc.)
--   articles         = KOL editorial / video posts that may *reference*
--                      an ingredient via articles.ingredient_id but
--                      aren't the canonical source.

-- pgvector + ts_vector both live in `extensions`; mirror the search_path
-- guard from 0003 so unqualified `vector` resolves during db push.
set local search_path = public, extensions;

create table if not exists public.ingredient_pages (
  ingredient_id uuid primary key references public.ingredients (id) on delete cascade,
  body_vn text,
  body_en text,
  -- Optional KOL byline for the page (e.g. "NutriAI Editorial",
  -- "Dr. Nguyen X."). Surfaced in the page hero alongside published_at.
  kol text,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  embedding vector(1536),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(kol, '')),     'B') ||
    setweight(to_tsvector('simple', coalesce(body_vn, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(body_en, '')), 'C')
  ) stored
);

create index if not exists ingredient_pages_search_idx
  on public.ingredient_pages using gin (search_vector);
create index if not exists ingredient_pages_embedding_idx
  on public.ingredient_pages using hnsw (embedding vector_cosine_ops);
create index if not exists ingredient_pages_published_idx
  on public.ingredient_pages (published_at desc);

drop trigger if exists set_updated_at on public.ingredient_pages;
create trigger set_updated_at before update on public.ingredient_pages
  for each row execute function public.tg_set_updated_at();

----------------------------------------------------------------------
-- Public-read RLS
----------------------------------------------------------------------
-- Same pattern as the rest of the Knowledge Hub: anyone can read,
-- writes happen via the service-role client which bypasses RLS.

alter table public.ingredient_pages enable row level security;

drop policy if exists "ingredient_pages_read_all" on public.ingredient_pages;
create policy "ingredient_pages_read_all" on public.ingredient_pages
  for select using (true);

comment on table public.ingredient_pages is
  'BR1 Knowledge Hub: canonical educational page body per ingredient (1:1 with ingredients). Separate from articles, which hosts KOL editorial.';
