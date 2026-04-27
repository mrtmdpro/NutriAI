# NutriAI

Evidence-based nutritional intelligence platform for Vietnamese and English
consumers. Search supplements, track adherence, and chat with a grounded AI
that cites every source.

## Phase 1 scope (shipped)

- **BR1 — Knowledge Hub**: search, supplement detail, Quality Index, content feed
- **BR2 — Adherence Tracking**: regimens, daily log, reminders (push + email), analytics
- **BR4 — Grounded RAG Assistant**: chat over our cited corpus
- **Monetization**: SePay.vn bank-transfer reconciliation, Free + Pro tiers

BR3 (NutriScan / OCR) is deferred to Phase 2.

## Stack

- **Framework**: Next.js 16 App Router + TypeScript + Turbopack on Vercel
- **UI**: Tailwind CSS v4 + shadcn/ui (radix-nova style), light-green theme (hue 152)
- **i18n**: next-intl with locale-prefixed routes (`/vi`, `/en`)
- **Backend**: Supabase (Postgres + Auth + RLS + pgvector + Storage)
- **AI**: Vercel AI SDK + Vercel AI Gateway, pgvector retrieval
- **Notifications**: Web Push + Resend email, Vercel Cron scheduler
- **Payments**: SePay.vn webhook reconciliation
- **Design**: `@google/stitch-sdk` programmatic generation

See [docs/llm-wiki](docs/llm-wiki) for the full architecture wiki.

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Provision Vercel + Supabase + AI Gateway
# (One-time, requires being logged into the Vercel CLI)
npx vercel link
npx vercel integration add supabase
npx vercel env pull .env.local

# 3. Apply Supabase migrations
npx supabase db push

# 4. Generate VAPID keys for Web Push
npx web-push generate-vapid-keys
# Add WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY / WEB_PUSH_CONTACT_EMAIL
# to Vercel env (and re-run env pull)

# 5. Add SePay credentials to Vercel env
# SEPAY_API_KEY, SEPAY_BANK_ACCOUNT, SEPAY_BANK_NAME, SEPAY_ACCOUNT_HOLDER
# (See https://my.dev.sepay.vn for sandbox)

# 6. Run dev server
npm run dev
```

## Scripts

| Command                    | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `npm run dev`              | Local dev server (Turbopack)                               |
| `npm run build`            | Production build                                           |
| `npm run start`            | Run the production build locally                           |
| `npm run lint`             | ESLint                                                     |
| `npm run stitch:generate`  | Regenerate UI mockups via the Stitch SDK                   |
| `npm run db:types`         | Regenerate `lib/supabase/database.types.ts` from Supabase  |
| `npm run test:e2e`         | Run Playwright public-flow smoke tests                     |
| `npm run test:e2e:install` | Install Playwright Chromium browser                        |

## Deployment (Vercel)

```bash
# Link the repo (creates the Vercel project on first run)
npx vercel link

# Configure env in Vercel dashboard or:
npx vercel env add ...

# Deploy a preview
npx vercel

# Promote to production
npx vercel deploy --prod
```

The repo includes a `vercel.json` with cron schedules:

| Path                              | Schedule        | Purpose                          |
| --------------------------------- | --------------- | -------------------------------- |
| `/api/cron/ingest-dsld`           | `0 2 * * *`     | Daily NIH DSLD seed              |
| `/api/cron/ingest-pubmed`         | `30 2 * * *`    | Daily PubMed evidence ingest     |
| `/api/cron/ingest-openfda`        | `0 3 * * *`     | Daily FDA recall watch           |
| `/api/cron/dispatch-reminders`    | `*/5 * * * *`   | Push + email regimen reminders   |

All times are UTC.

## Project layout

See [docs/llm-wiki/04-conventions.md](docs/llm-wiki/04-conventions.md).

## License

See [LICENSE](LICENSE).
