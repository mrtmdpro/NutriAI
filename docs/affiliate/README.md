# Affiliate URL management

`vn-*` supplement rows carry a `supplements.affiliate_url` that points at
a Shopee VN listing. Today these are **placeholder search URLs** — they
land the user on Shopee's search results for the brand + product. They
are deterministic (don't rot when sellers churn) and produce a valid
"Mua trên Shopee" experience without us needing to lock in a specific
seller.

## Lifecycle

```
1. Placeholder phase (today)        → affiliate_url = https://shopee.vn/search?keyword=...
2. Specific-listing phase (manual)  → affiliate_url = https://shopee.vn/{vanity}-i.{shop_id}.{item_id}
3. Tracked-link phase (post-approval) → affiliate_url = above URL with affiliate_id query param
```

Phase 2 → phase 3 is a single `UPDATE` per row (or one find/replace
across all `affiliate_url` values via a Supabase Studio SQL block).

## How URLs were initially seeded

- The 8 creatine `vn-*` rows got hand-crafted search queries
  (in [`shopee-todo.csv`](./shopee-todo.csv)) that strip pack-size noise
  ("optimum nutrition micronized creatine" instead of the full SKU
  name). These produce cleaner Shopee result pages.
- The other 49 `vn-*` rows (magnesium / vitamin D / vitamin C / omega-3
  / whey / iron / zinc curations) got auto-generated URLs derived from
  `name_en`: lowercased, apostrophes stripped, whitespace collapsed,
  spaces → `%20`. Auto-generation runs in pure SQL — see migration log
  if you need to repeat it.

You can replace any auto-generated URL with a hand-crafted one any time
by updating `supplements.affiliate_url` directly.

## CSV

[`shopee-todo.csv`](./shopee-todo.csv) tracks per-product:

| Column | Meaning |
|---|---|
| `slug` | Foreign key into `public.supplements.slug` |
| `brand_product` | Human label for sanity-check |
| `search_query` | Raw query string used to build the Shopee search URL |
| `placeholder_url` | Live in DB today |
| `canonical_url_TODO` | Empty until someone clicks through Shopee, picks a seller, and pastes the canonical URL here |

When you have time to manually source canonical product URLs (better
attribution, per-seller rating shows up, deeper link on mobile), fill
in the `canonical_url_TODO` column and let the agent know — it will
update each `supplements.affiliate_url` accordingly.

## Adding a new product

The [`add-ingredient` skill](../../.cursor/skills/add-ingredient/SKILL.md)
Step 5 instructs the agent to capture a Shopee search URL alongside
each product it curates and write it to `affiliate_url` +
`affiliate_platform = 'shopee'` at the same time as the supplement
row insert. Don't add products without an affiliate URL — empty
columns mean the buy CTA disappears.

## TOS / disclosure

Affiliate links require disclosure. The UI surfaces a small inline
note next to every "Mua trên Shopee" CTA. Quality Index scoring is
kept independent of affiliate revenue — the rubric in the skill is
explicit about that. Don't let a higher commission tempt a tier
bump; that breaks the editorial moat.
