# 07 — Bilingual

NutriAI is bilingual VN/EN at every layer.

## URL routing

- Locale prefix is **always** present: `/vi/...` or `/en/...`. There is no
  unprefixed default. The proxy redirects bare paths to the user's
  preferred locale (default `vi`).
- Driven by [`createMiddleware`](https://next-intl.dev) wrapped inside
  [proxy.ts](../../proxy.ts).

## Static UI strings

- Source of truth is per-locale JSON files under
  [messages/](../../messages/).
- Server components: `await getTranslations("Namespace")`.
- Client components: `useTranslations("Namespace")`.
- New strings must be added to both `vi.json` and `en.json` in the same
  commit.

## Dynamic content (DB)

- Bilingual columns are paired: `name_vn` / `name_en`,
  `summary_vn` / `summary_en`. The active locale picks the right column at
  query time.
- For ingested content (Sprint 2 ETL), an LLM pass writes the missing
  translation grounded on the source text. The original source language
  is preserved alongside.
- Embeddings are computed against the English text for consistency
  across the corpus, but query-time translation can run user prompts
  through the same embed pipeline regardless of language.

## Mixed-locale UX

- The Stitch generation prompts request bilingual labels where natural —
  e.g. inputs named in VN while structural English is OK.
- Numeric formats (currency, dates) use `Intl` with the active locale.
