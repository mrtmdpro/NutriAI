# 11 — Auth

NutriAI uses Supabase Auth with two paths in:

1. Email + password — Sprint 1
2. Google OAuth (PKCE) — Sprint 1

Other providers can be added later by enabling them in the Supabase
dashboard and reusing the same callback route.

## Routes

| Path                                  | Purpose                                                |
| ------------------------------------- | ------------------------------------------------------ |
| `/[locale]/login`                     | Email + password sign-in, with Google OAuth button     |
| `/[locale]/register`                  | Email + password sign-up, with Google OAuth button     |
| `/[locale]/auth/callback`             | Exchange `?code=` for a session (OAuth + email confirm)|

## Server Actions ([lib/auth/actions.ts](../../lib/auth/actions.ts))

| Action                  | Returns                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `signInWithPassword(fd)`| `AuthResult` — `{ ok: true, redirectTo }` or `{ ok: false, code }` |
| `signUpWithPassword(fd)`| `AuthResult` — confirms inbox if email confirmation is required    |
| `signInWithGoogle(next)`| `{ ok: true, url }` — client should `window.location` to it        |
| `signOut()`             | `void` — caller must navigate after                                |

All actions use the cookie-bound Supabase client from
[lib/supabase/server.ts](../../lib/supabase/server.ts). Sessions are
maintained automatically by `@supabase/ssr` cookies, refreshed on every
proxy hit ([proxy.ts](../../proxy.ts) → `updateSession`).

## Open-redirect guard

Every action that honors a `next` query parameter calls `safeNext()`,
which only returns paths that start with `/`. Absolute URLs are dropped
and the user is sent to `/[locale]/dashboard` instead. The
[`/[locale]/auth/callback`](../../app/[locale]/auth/callback/route.ts)
route handler applies the same guard.

## Profile provisioning

A row in `public.profiles` is created automatically when a new
`auth.users` row is inserted, via the `on_auth_user_created` trigger. The
trigger reads `raw_user_meta_data->>'locale'` if the client provided it
(e.g. via OAuth state) and falls back to `vi`. See
[supabase/migrations/0001_profiles.sql](../../supabase/migrations/0001_profiles.sql).

## Gating

The proxy gates `/dashboard/**`, `/account/**`, and `/chat` (see
[proxy.ts](../../proxy.ts)). For defense in depth, every gated page also
calls `getCurrentUser()` and short-circuits to `/login?next=...` if the
session is missing.

## Open work

- **Forgot password** flow — Sprint 7 polish.
- **Magic-link sign-in** — deferred. Email + Google covers the consumer
  paths well enough for Phase 1.
- **Multi-device session management** — out of scope for Phase 1.
