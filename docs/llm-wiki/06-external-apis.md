# 06 — External APIs

## NIH ODS DSLD (Dietary Supplement Label Database)

- Public, no key.
- Endpoints used:
  - `GET /v9/search-filter?q=<query>&size=<n>` — paginated hits
  - `GET /v9/label/<dsldId>` — full label record
- Client: [`lib/knowledge/dsld.ts`](../../lib/knowledge/dsld.ts).
- Cron: [`/api/cron/ingest-dsld`](../../app/api/cron/ingest-dsld/route.ts),
  schedule `0 2 * * *` (daily 02:00 UTC).
- Idempotent on `slug = "dsld-<dsldId>"`.

## PubMed E-utilities

- Public; 3 req/s without key, 10 req/s with `NCBI_API_KEY` (optional, not
  yet wired).
- Endpoints used:
  - `esearch` — find PMIDs for a query, filtered to RCTs / meta-analyses
    / clinical trials / systematic reviews.
  - `esummary` — lightweight metadata.
  - `efetch` (text mode) — abstracts.
- Client: [`lib/knowledge/pubmed.ts`](../../lib/knowledge/pubmed.ts).
- Cron: [`/api/cron/ingest-pubmed`](../../app/api/cron/ingest-pubmed/route.ts),
  schedule `30 2 * * *`.
- Idempotent on `(source = 'pubmed', source_ref = pmid)`.
- Evidence tier inferred from publication types via
  `inferEvidenceTier()`.

## OpenFDA

- Public, optional `api_key` for higher quotas.
- Endpoint used: `GET /food/enforcement.json` filtered to
  `product_description:supplement`.
- Client: [`lib/knowledge/openfda.ts`](../../lib/knowledge/openfda.ts).
- Cron: [`/api/cron/ingest-openfda`](../../app/api/cron/ingest-openfda/route.ts),
  schedule `0 3 * * *`.
- **Sprint 2: log-only.** Persistence to a dedicated `recalls` table is
  Sprint 4 work, where it pairs with adherence-tracking notifications.

## SePay

- VN bank-transfer reconciliation via webhook.
- Docs: https://developer.sepay.vn/en
- Webhook posts: gateway, transferAmount, content (memo), referenceCode, …
- We match by `content` against our generated payment code; idempotent on
  the SePay event `id`.
- See [10-payments.md](./10-payments.md). Implemented in Sprint 6.

## Stitch

- Google's UI design tool, free 350 generations/month.
- SDK: `@google/stitch-sdk`. Auth via `STITCH_API_KEY`.
- We generate once and version outputs in `design/stitch/`.
- See [scripts/stitch-generate.ts](../../scripts/stitch-generate.ts).

## Vercel AI Gateway

- Single key `AI_GATEWAY_API_KEY` fronts every model provider.
- Embeddings: `openai/text-embedding-3-small` → `vector(1536)`. See
  [`lib/knowledge/embed.ts`](../../lib/knowledge/embed.ts).
- Bilingual translation: `openai/gpt-4o-mini` with structured output. See
  [`lib/knowledge/translate.ts`](../../lib/knowledge/translate.ts).
