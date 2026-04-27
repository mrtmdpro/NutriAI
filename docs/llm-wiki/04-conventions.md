# 04 — Conventions

## File layout

```
app/
  [locale]/        # all UI routes (locale-prefixed)
    layout.tsx     # root layout with NextIntlClientProvider
    page.tsx       # landing
    search/        # BR1
    supplements/[slug]/
    quality-index/
    feed/
    dashboard/     # BR2 (auth-gated)
    chat/          # BR4 (auth-gated)
    pricing/
    account/billing/
    login/
    register/
  api/             # locale-agnostic
    auth/callback/
    cron/
    webhooks/sepay/
    chat/
    push/
  globals.css      # theme tokens
components/
  ui/              # shadcn primitives (radix-nova style)
  app-shell.tsx    # nav + footer
  locale-switcher.tsx
  user-menu.tsx
  *-card.tsx etc.  # feature components
i18n/
  routing.ts
  navigation.ts    # typed Link/redirect/useRouter
  request.ts       # getRequestConfig
messages/
  vi.json
  en.json
lib/
  env.ts           # zod-validated env access
  supabase/
    client.ts      # browser client (SSR-safe)
    server.ts      # cookie-bound + service-role
    middleware.ts  # session refresh helper (lib-level, not the root proxy)
    database.types.ts
  auth/
    index.ts       # getCurrentUser()
    actions.ts     # server actions (signOut, etc.)
  knowledge/       # retrieval helpers (Sprint 5)
  reminders/       # push + email transports (Sprint 4)
  payments/        # SePay payment-code utils (Sprint 6)
proxy.ts           # locale + auth gating (Next.js 16 file convention)
scripts/
  stitch-generate.ts
design/
  stitch/          # generated outputs (versioned)
docs/
  llm-wiki/        # this wiki
```

## Server vs client components

- Default to server components.
- Add `"use client"` only when you need interactivity, hooks, or browser APIs.
- Never import the service-role Supabase client from a Client Component.

## Imports

- Always use the `@/` path alias for app-relative imports.
- Use the typed `Link`, `redirect`, `useRouter`, `usePathname` from
  [@/i18n/navigation](../../i18n/navigation.ts) — never bare `next/link`
  inside a locale-aware page.

## Theming

- All foundational surfaces use shadcn tokens (`bg-background`,
  `bg-card`, `text-foreground`, `text-muted-foreground`,
  `border-border`, `bg-primary`, `text-primary`, `bg-accent`).
- Never hard-code hex colors. The light-green hue lives once, in
  [globals.css](../../app/globals.css), as `oklch(0.72 0.16 152)`.

## AI usage

- Use the Vercel AI SDK with the AI Gateway. Pass models as
  `"openai/gpt-4o"` style strings, not as imported provider clients,
  unless a specific provider feature requires it.

## i18n strings

- Every user-visible string must be added to both
  [messages/vi.json](../../messages/vi.json) and
  [messages/en.json](../../messages/en.json), under a stable key.
- Server components: `await getTranslations("Namespace")`.
- Client components: `useTranslations("Namespace")`.

## Forms

- `react-hook-form` + `zod` for validated forms (added in Sprint 4).
- shadcn `Form` primitive wires error display.

## Error handling

- Throw on the server, render an `error.tsx` boundary on the client.
- Never expose service-role responses to the browser.
