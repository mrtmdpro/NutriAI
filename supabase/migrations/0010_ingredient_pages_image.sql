-- Sprint 8 follow-up: hero illustration slot for ingredient pages.
--
-- `image_url` accepts either a workspace-relative path
-- (e.g. /ingredients/creatine.png served from public/) or an absolute
-- URL when we eventually source illustrations from a CDN. Either form
-- is rendered through next/image, which optimizes on serve.
--
-- Nullable: ingredients without an authored illustration just don't
-- show one, the route falls back to a single-column hero.

alter table public.ingredient_pages
  add column if not exists image_url text;

comment on column public.ingredient_pages.image_url is
  'Hero illustration. Either /-prefixed public/ asset path, or a fully-qualified URL.';
