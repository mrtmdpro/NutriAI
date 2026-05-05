-- Sprint 8 follow-up: marketplace affiliate URL on supplements.
--
-- Each VN-marketplace product can carry a commercial path (Shopee VN,
-- Tiki, Lazada, etc.) alongside its existing manufacturer / canonical
-- `source_url`. The two fields serve different purposes:
--   * source_url     = manufacturer or DSLD anchor; preserves
--                      evidence/traceability integrity. Untouched.
--   * affiliate_url  = marketplace listing the user can buy from.
--                      Today: raw Shopee VN URLs (placeholders, no
--                      tracking ID). Post Shopee-Affiliate approval:
--                      tracked URLs swap in via a single UPDATE.
--
-- `affiliate_platform` stays free-text (not an enum) so adding tiki /
-- lazada later doesn't need a migration. NULL means no commercial
-- path (DSLD-ingested rows, ingredients without curated SKUs).

alter table public.supplements
  add column if not exists affiliate_url text,
  add column if not exists affiliate_platform text;

create index if not exists supplements_affiliate_idx
  on public.supplements (affiliate_platform)
  where affiliate_url is not null;

comment on column public.supplements.affiliate_url is
  'Marketplace listing URL the user can purchase from. Today populated with raw Shopee VN product URLs (placeholders, no tracking). Swapped to tracked URLs post Shopee-Affiliate approval via a single UPDATE.';

comment on column public.supplements.affiliate_platform is
  'Marketplace identifier. Currently shopee; tiki/lazada possible later. NULL means no commercial path.';
