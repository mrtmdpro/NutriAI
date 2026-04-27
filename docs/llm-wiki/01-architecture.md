# 01 — Architecture

```
Browser (vi/en)
   │
   ▼
Next.js 16 (App Router) on Vercel — Fluid Compute
   │  proxy.ts: locale + auth gating
   ├─→ Supabase (Postgres + Auth + RLS + pgvector + Storage)
   ├─→ Vercel AI Gateway (chat completions + embeddings)
   ├─→ Vercel Cron — ingest from external APIs, dispatch reminders
   └─→ SePay webhook — bank-transfer reconciliation
```

## Why these pieces

- **Next.js 16 + App Router**: server components let us colocate retrieval
  with rendering, RSC streaming pairs cleanly with the AI SDK, and Vercel
  is the deploy target.
- **Supabase**: bundles Postgres + Auth + RLS + pgvector. We avoid building
  user mgmt and we get vector search for free.
- **Vercel AI Gateway**: one key fronts every model provider. We never
  hard-code `@ai-sdk/openai` etc. at the call site — see
  [conventions.md](./04-conventions.md).
- **next-intl**: locale-prefixed routes (`/vi/...`, `/en/...`) with
  Vietnamese as default. See [bilingual.md](./07-bilingual.md).
- **shadcn/ui + Tailwind v4**: component primitives we own, themed via
  CSS custom properties in [globals.css](../../app/globals.css). Light-green
  theme is hue 152.
- **SePay**: VN-native bank-transfer gateway. We never touch card data.

## Runtime model

- All routes are Fluid Compute (Node.js). Edge runtime is _not_ used.
- Static pages (landing, pricing, public knowledge hub) cached on Vercel.
- User-scoped pages (`/dashboard/**`, `/chat`, `/account/**`) are dynamic.
- Cron jobs at `/api/cron/*` are protected by `CRON_SECRET` and run via
  Vercel Cron triggers declared in `vercel.json` (added in Sprint 2).
- The webhook at `/api/webhooks/sepay` is public but verifies sender via
  IP allow-list + Authorization header.

## Trust boundaries

- **Browser → Next.js**: Supabase anon key only. RLS is the safety net.
- **Next.js → Supabase (cookie-bound)**: scoped to authenticated user.
- **Next.js (server-only) → Supabase (service role)**: cron + webhooks
  only. Service-role client lives in
  [lib/supabase/server.ts](../../lib/supabase/server.ts) under
  `createServiceClient()` and must never be imported from a Client
  Component.
