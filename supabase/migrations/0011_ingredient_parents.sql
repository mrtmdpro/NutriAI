-- Sprint 8 follow-up: derivative / parent taxonomy on ingredients.
--
-- Some ingredients are chemical derivatives of a "parent" molecule
-- (e.g. Creatine HCl is a salt form of Creatine; Vitamin D3 is a form
-- of Vitamin D). These derivatives shouldn't appear as primary
-- top-level entries in search — users searching "creatine" expect to
-- see the canonical Creatine page, with HCl reachable as a sub-page
-- from there.
--
-- Self-referencing nullable FK with ON DELETE SET NULL:
--   * NULL parent → top-level molecule (default).
--   * Non-NULL    → derivative; surfaces only as a variant under
--                   its parent's ingredient_pages route.
--
-- The constraint name is loose by design — we'll only ever have one
-- self-ref FK on this table, and Postgres auto-generates a stable
-- name if we don't pin one.

alter table public.ingredients
  add column if not exists parent_ingredient_id uuid
    references public.ingredients (id) on delete set null;

create index if not exists ingredients_parent_idx
  on public.ingredients (parent_ingredient_id)
  where parent_ingredient_id is not null;

comment on column public.ingredients.parent_ingredient_id is
  'Optional self-reference. Non-null marks this ingredient as a derivative / form of the parent molecule. Derivatives are filtered out of top-level search and surface as variants under their parent ingredient page.';
