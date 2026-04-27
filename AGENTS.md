# Agent guide for NutriAI

Read [docs/llm-wiki/README.md](docs/llm-wiki/README.md) first. It is the
condensed, sequential, accurate explanation of the codebase.

## Hard rules

1. **Theme tokens, not hex.** All colors come from
   [app/globals.css](app/globals.css). Never write a literal `#hex` for a
   foundational color.
2. **Locale-prefixed routes.** Use the typed `Link`/`useRouter`/`redirect`
   from [`@/i18n/navigation`](i18n/navigation.ts). Never `next/link`
   directly inside locale-aware pages.
3. **Bilingual strings live in JSON.** Every user-visible string must be
   added to both [messages/vi.json](messages/vi.json) and
   [messages/en.json](messages/en.json) under a stable key.
4. **Server-only code stays server-only.** Never import the Supabase
   service-role client from a Client Component or expose its responses to
   the browser.
5. **AI uses the Gateway.** Pass models as `"openai/gpt-4o"`-style strings
   through the Vercel AI SDK. Don't import `@ai-sdk/openai` etc. unless
   you need a provider-specific feature.
6. **No edge runtime.** All Functions run on Fluid Compute (Node.js).

## Next.js 16

This is **not** the Next.js you know from training. Read
`node_modules/next/dist/docs/` before changing anything in `app/` or
`proxy.ts`. Note: Next.js 16 renamed `middleware.ts` to `proxy.ts`; the
exported function must be named `proxy` (or default).

## Conventions

See [docs/llm-wiki/04-conventions.md](docs/llm-wiki/04-conventions.md).

## Decisions log

After making a notable architectural decision, append it (top) to
[docs/llm-wiki/05-decisions.md](docs/llm-wiki/05-decisions.md).

## Sprint structure

The plan lives at the top of the project history. Sprints are:

- Sprint 0: Bootstrap (this commit)
- Sprint 1: Auth + App Shell
- Sprint 2: Knowledge Hub data layer (BR1)
- Sprint 3: Knowledge Hub UI (BR1)
- Sprint 4: Adherence Tracking (BR2)
- Sprint 5: RAG Chat (BR4)
- Sprint 6: SePay payments
- Sprint 7: Polish + Launch

Run a focused code review after each sprint.
