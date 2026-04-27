# 05 — Decisions

A chronological log of architectural decisions. Append-only. New entries on
top.

## 2026-04-27 — Sprint 7 — Polish + Launch

- **Sitemap and robots use `MetadataRoute`** so Next.js generates
  `sitemap.xml` and `robots.txt` automatically. Authenticated routes
  (`/dashboard`, `/account`, `/chat`) are intentionally excluded from
  the sitemap and disallowed in `robots`.
- **OG image generated at `app/[locale]/opengraph-image.tsx`** via
  `next/og`. One image per locale; the headline + tagline switch on
  `params.locale`. CSS variables aren't readable inside `next/og`, so
  the OG hex literals (`#86EFAC` etc.) are mirrored from `globals.css`
  with a comment pointing back to the source of truth.
- **Favicon at `app/icon.tsx`** (auto-generated PNG) replaces the
  default `favicon.ico`.
- **Localized `app/[locale]/{not-found,error,loading}.tsx`** so 404s,
  thrown errors, and Suspense fallbacks all stay inside the bilingual
  shell.
- **Playwright smoke tests** live in `tests/e2e/public-flows.spec.ts`.
  No Supabase required; verifies locale routing, gating, and key
  empty-state copy. Auth-gated flows are deferred to a follow-up
  integration suite that requires a seeded test project.
- **`metadataBase` reads `NEXT_PUBLIC_SITE_URL`** so canonical URLs in
  OG cards and sitemaps point at the deployed origin in production
  and at localhost for previews.

## 2026-04-27 — Sprint 6 — SePay payments

- **Bank-transfer reconciliation, not card-charge.** SePay watches our
  bank account; when a transfer arrives, it POSTs us. We never touch
  card data.
- **`payment_code` is the join key** between our DB and the bank's
  memo field. Format: `NUTRI<userId8><nano8>` — 18 alphanumeric chars,
  no separators (some banks strip them).
- **Idempotent webhook on `payment_events.id`** (the SePay event id is
  the natural primary key). A SePay retry inserts ON CONFLICT DO
  NOTHING-equivalent — duplicate response returns 200, no double-credit.
- **Three-layer auth on the webhook**: source IP allow-list,
  `Authorization: Apikey ${SEPAY_API_KEY}`, and the `payment_code`
  match against an existing `subscriptions` row. Each layer fails
  closed.
- **VietQR via `img.vietqr.io`** — public image API; we never expose
  the bank account/holder in the client bundle. The `/api/payments/qr`
  proxy resolves the user's pending order, validates it, and 302s to
  the public QR image.
- **Pricing pinned in code** at `lib/payments/sepay.ts` so the SQL row
  amount, the QR amount, and the displayed price never drift.
- **Polling on the pending-payment panel.** Every 8s the panel calls
  `router.refresh()` so the webhook-driven status flip surfaces
  without a SSE/WS.
- **Always 200 to SePay,** even on no-match cases. Their dashboard
  treats 4xx/5xx as retry signals; we'd rather log + manual
  reconcile than fight a retry storm.

## 2026-04-27 — Sprint 5 — RAG Chat (BR4)

- **Pre-retrieve before generation** (no tool calls). The user's last
  turn is embedded, hybrid retrieval runs once, and the context is
  baked into the system prompt. Predictable latency, easy to audit,
  and the model never wanders.
- **Hybrid retrieval lives in SQL** as `search_knowledge_hybrid()`,
  union-all'ing FTS and vector top-K per source (evidence, articles,
  ingredients, supplements). Caller can pass `embedding=NULL` to fall
  back to FTS-only when the AI Gateway is unconfigured.
- **Citations are server-side metadata, not generated text.** The API
  returns the citation list as `messageMetadata` on the streamed
  response, keyed `c1..cN`. The model only emits inline `[cN]` tags;
  the client looks up the actual title/href.
- **Free tier = 10 messages/day.** Gated by
  `chat_messages_today(user_id)` SQL helper + `chat_message_log` table.
  Pro skips the gate. We record before the model call so denial of
  service from streaming failures still consumes quota — preferable to
  the inverse.
- **System prompt forbids outside-context answers** and refuses when
  retrieval returns zero rows.
- **Locale-aware prompt directive** so the model answers in vi or en
  per the page locale.

## 2026-04-27 — Sprint 4 — Adherence Tracking

- **Schedule storage**: `regimen_items` carries `times_of_day text[]`
  (HH:MM strings) + `days_of_week int[]` (0-6 Sun-first), stored in the
  regimen's IANA timezone. The cron and "today's schedule" view both
  resolve absolute UTC instants via `Intl.DateTimeFormat` round-trips
  rather than carrying offsets in the DB. DST is therefore correct
  automatically.
- **Idempotency**: `reminder_log` has `UNIQUE (regimen_item_id,
  scheduled_for, channel)`. The dispatcher inserts before sending; a
  unique-violation (`23505`) means a previous run already fired and
  the current run is a no-op. Cron retries on failure can't double-send.
- **Optimistic intake toggle**: client component uses React 19's
  `useOptimistic` so taps feel instant; the Server Action revalidates
  `/dashboard` and `/dashboard/analytics` so canonical state reconciles
  on next render.
- **Analytics computed in-memory** (~2.5k rows worst case for one user
  over 12 weeks). Avoids a heavy SQL function until the read pattern
  warrants it.
- **Push public key delivered via Server Action** (`getPushPublicKey`)
  rather than an env-injected client constant. Lets us return `null`
  when VAPID isn't configured and gracefully hide the affordance.
- **Service worker is plain JS** at `public/sw.js`. ESLint config
  ignores it; we don't bundle it through Turbopack so it stays
  trivially auditable.
- **Email reminders via Resend**, lazily-constructed client. If
  `RESEND_API_KEY` isn't set, the dispatcher logs and skips email but
  still fires push.
- **PushToggle uses lazy-init `useState(detectPushSupport)`** so the
  initial render value is computed synchronously from `window` /
  `navigator`. Avoids Next.js 16's `react-hooks/set-state-in-effect`
  warning.

## 2026-04-27 — Sprint 3 — Knowledge Hub UI

- **`pickLocale<K, Row>`** is the single source of truth for VN/EN
  fallback. Lives in [`lib/i18n/locale-text.ts`](../../lib/i18n/locale-text.ts).
  Every retrieval helper maps DB rows through it; raw `*_vn` / `*_en`
  fields never leak past the data layer.
- **`asLocale(string)`** narrows arbitrary URL params to the `Locale`
  union, falling back to default. Eliminates `as Locale` casts at the
  page boundary.
- **Category translation lives in `messages/{vi,en}.json` under
  `Search.categories`,** keyed on the raw DB enum string. A
  single helper (`getCategoryLabel` server / `useCategoryLabel`
  client) handles fallback to "unknown" so unrecognized categories
  still render legibly.
- **`formatVnd(amount, locale)`** in [`lib/format.ts`](../../lib/format.ts).
  Locale-aware via `Intl.NumberFormat`; `vi-VN` for VN users gets
  `₫` grouping, `en-US` gets western grouping. No hand-rolled
  formatters elsewhere.
- **Search uses Postgres `websearch_to_tsquery` via supabase-js
  `textSearch`,** with `config: "simple"` to match the
  `to_tsvector('simple', …)` columns in the migration. Vector
  retrieval is wired in the schema (HNSW indexes shipped) but not
  blended in here yet — Sprint 5 (RAG) closes that loop.
- **`/feed` only links text articles to a real target if a
  `video_url` exists.** Text articles render previews without a
  "Read more" CTA until article-detail pages ship in a later sprint.
- **Score visualizations expose `role="progressbar"` + ARIA
  attributes.** Both `ScoreCard` (supplement detail) and `ScoreBar`
  (Quality Index) are screen-reader announceable.
- **Form GETs use `<form method="get">`** (no `action`), so submission
  preserves the document's pathname. Hidden inputs preserve filter
  state across query rewrites.

## 2026-04-27 — Sprint 2 — Knowledge Hub data layer

- **Embedding model = `openai/text-embedding-3-small`** at 1536 dims.
  Pinned to match the `vector(1536)` column type. Routed through the
  Vercel AI Gateway, not a direct provider package, so we can switch
  models without code changes.
- **Hybrid search = FTS GIN ∪ HNSW cosine.** Sprint 3 wires the actual
  retrieval; Sprint 2 builds the indices.
- **Bilingual content via per-row `*_vn` / `*_en` columns,** not a
  separate translations table. Simpler queries, smaller payloads, and
  the LLM translation cost is amortized across infrequent ETL runs.
- **`search_vector` is a generated tsvector column** (not a trigger),
  so it's always in sync with the source. Weighted A/B/C lets us boost
  matches in `name_*` and `brand` over body text.
- **Public-read RLS** on Knowledge Hub tables. `select using (true)`
  policies; writes through the service-role client only. Avoids the
  trap of accidentally exposing writes to anon clients.
- **OpenFDA recalls log-only in Sprint 2.** Persistence + user
  notification deferred to Sprint 4 where it composes with adherence
  reminders.
- **TypeScript target = ES2022** (was ES2017). Required for the regex
  `s` flag we use in the PubMed text parser, and matches Node 20.11+.

## 2026-04-27 — Sprint 1 — Auth + App Shell

- **Supabase Auth = email/password + Google OAuth.** No magic links yet.
- **`profiles` table** is created automatically by an
  `after insert on auth.users` trigger
  ([supabase/migrations/0001_profiles.sql](../../supabase/migrations/0001_profiles.sql)).
  RLS lets a user read/update only their own row; cron and webhooks use the
  service-role client to bypass.
- **OAuth callback path is locale-prefixed**
  (`/[locale]/auth/callback`) so the post-OAuth redirect lands on the same
  locale the user signed in from.
- **`safeNext` guard** on every redirect-to-`next` path. We only honor
  same-origin paths starting with `/`. No open redirect.
- **`getCurrentUser` is `cache()`-wrapped** so multiple Server Components
  on a single render share one Supabase round-trip. Pairs with the proxy's
  `updateSession` call which already performs the upstream refresh.
- **Mobile nav uses shadcn `Sheet`** at `< md`. Above `md` we use the
  inline button row.
- **Server Actions return discriminated `AuthResult` unions**. Errors are
  string codes the client maps to translated copy — never raw Supabase
  error strings (which leak shape and may not be locale-correct).

## 2026-04-27 — Sprint 0 — Bootstrap

- **Phase 1 scope = BR1 + BR2 + BR4.** BR3 NutriScan deferred to phase 2.
- **Default locale: Vietnamese.** English available via switcher. More
  locales planned but not built.
- **Light-green primary at hue ~152, oklch(0.72 0.16 152).** Centralized
  in `app/globals.css`; never hard-coded.
- **Supabase via Vercel Marketplace** chosen over Neon to also get Auth,
  RLS, and pgvector in one place.
- **Vercel AI Gateway** chosen over single-provider AI SDK packages so
  RAG can swap models without code edits.
- **SePay (not Stripe)** for monetization: bank-transfer reconciliation
  is the only first-class option in VN consumer market.
- **Stitch SDK programmatic** generation via `scripts/stitch-generate.ts`.
  Outputs land in `design/stitch/` and are versioned to avoid burning the
  350/month free quota.
- **Auth required.** Email/password + Google OAuth via Supabase Auth.
- **No edge runtime.** All Functions are Fluid Compute (Node.js).
