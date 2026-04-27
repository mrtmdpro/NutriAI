-- Sprint 5: RAG (BR4) — hybrid retrieval SQL function + chat rate limiting.

create extension if not exists "vector"   with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

----------------------------------------------------------------------
-- chat_message_log: rate-limit accounting per user
----------------------------------------------------------------------
create table if not exists public.chat_message_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists chat_message_log_user_created_idx
  on public.chat_message_log (user_id, created_at desc);

alter table public.chat_message_log enable row level security;

drop policy if exists "chat_log_self_select" on public.chat_message_log;
create policy "chat_log_self_select" on public.chat_message_log
  for select using (auth.uid() = user_id);

-- Inserts go through the service-role client to keep the write path
-- centralized; we still add a self-insert policy as defense in depth.
drop policy if exists "chat_log_self_insert" on public.chat_message_log;
create policy "chat_log_self_insert" on public.chat_message_log
  for insert with check (auth.uid() = user_id);

----------------------------------------------------------------------
-- Hybrid retrieval: FTS + vector cosine, unioned across the corpus
----------------------------------------------------------------------
--
-- Returns up to `total_limit` rows. The embedding parameter is used
-- only when non-null; FTS-only callers may pass NULL.
--
-- Result schema:
--   source        text   ('evidence' | 'article' | 'ingredient' | 'supplement')
--   source_id     uuid   row id in the source table
--   slug          text   stable URL-safe identifier (PMID for evidence)
--   title         text   English headline
--   content       text   English summary / description / body
--   citation_url  text   external citation link, when available
--   score         real   max of FTS rank and (1 - cosine_distance) per row

create or replace function public.search_knowledge_hybrid(
  query text,
  query_embedding vector(1536),
  total_limit int default 16
)
returns table (
  source text,
  source_id uuid,
  slug text,
  title text,
  content text,
  citation_url text,
  score real
)
language sql
stable
parallel safe
as $$
  with q as (
    select case
      when length(coalesce(query, '')) > 0
        then websearch_to_tsquery('simple', query)
      else null
    end as ts_query
  ),
  -- clinical_evidence: FTS
  evidence_fts as (
    select
      'evidence'::text as source,
      e.id as source_id,
      e.source_ref::text as slug,
      e.title_en as title,
      coalesce(e.summary_en, '') as content,
      e.citation_url,
      ts_rank(e.search_vector, q.ts_query)::real as score
    from public.clinical_evidence e, q
    where q.ts_query is not null and e.search_vector @@ q.ts_query
    order by score desc
    limit 8
  ),
  -- clinical_evidence: vector
  evidence_vec as (
    select
      'evidence'::text,
      e.id,
      e.source_ref::text,
      e.title_en,
      coalesce(e.summary_en, ''),
      e.citation_url,
      (1 - (e.embedding <=> query_embedding))::real
    from public.clinical_evidence e
    where query_embedding is not null and e.embedding is not null
    order by e.embedding <=> query_embedding asc
    limit 8
  ),
  -- articles: FTS
  article_fts as (
    select
      'article'::text,
      a.id,
      a.slug,
      a.title_en,
      coalesce(a.body_en, ''),
      null::text,
      ts_rank(a.search_vector, q.ts_query)::real
    from public.articles a, q
    where q.ts_query is not null and a.search_vector @@ q.ts_query
    order by 7 desc
    limit 4
  ),
  -- articles: vector
  article_vec as (
    select
      'article'::text,
      a.id,
      a.slug,
      a.title_en,
      coalesce(a.body_en, ''),
      null::text,
      (1 - (a.embedding <=> query_embedding))::real
    from public.articles a
    where query_embedding is not null and a.embedding is not null
    order by a.embedding <=> query_embedding asc
    limit 4
  ),
  -- ingredients: FTS
  ingredient_fts as (
    select
      'ingredient'::text,
      i.id,
      i.slug,
      i.name_en,
      coalesce(i.description_en, ''),
      null::text,
      ts_rank(i.search_vector, q.ts_query)::real
    from public.ingredients i, q
    where q.ts_query is not null and i.search_vector @@ q.ts_query
    order by 7 desc
    limit 4
  ),
  -- ingredients: vector
  ingredient_vec as (
    select
      'ingredient'::text,
      i.id,
      i.slug,
      i.name_en,
      coalesce(i.description_en, ''),
      null::text,
      (1 - (i.embedding <=> query_embedding))::real
    from public.ingredients i
    where query_embedding is not null and i.embedding is not null
    order by i.embedding <=> query_embedding asc
    limit 4
  ),
  -- supplements: FTS only (no embedding column)
  supplement_fts as (
    select
      'supplement'::text,
      s.id,
      s.slug,
      s.name_en,
      coalesce(s.description_en, ''),
      null::text,
      ts_rank(s.search_vector, q.ts_query)::real
    from public.supplements s, q
    where q.ts_query is not null and s.search_vector @@ q.ts_query
    order by 7 desc
    limit 4
  ),
  all_results as (
    select * from evidence_fts
    union all select * from evidence_vec
    union all select * from article_fts
    union all select * from article_vec
    union all select * from ingredient_fts
    union all select * from ingredient_vec
    union all select * from supplement_fts
  )
  select source, source_id, slug, title, content, citation_url,
         max(score)::real as score
  from all_results
  group by source, source_id, slug, title, content, citation_url
  order by score desc
  limit total_limit;
$$;

comment on function public.search_knowledge_hybrid is
  'BR4 RAG retrieval. Hybrid FTS + pgvector cosine over evidence, articles, ingredients, supplements. Pass embedding=NULL for FTS-only.';

----------------------------------------------------------------------
-- chat_messages_today: daily count helper for free-tier rate limiting
----------------------------------------------------------------------
create or replace function public.chat_messages_today(p_user_id uuid)
returns bigint
language sql
stable
as $$
  select count(*)
  from public.chat_message_log
  where user_id = p_user_id
    and created_at >= date_trunc('day', now() at time zone 'UTC');
$$;
