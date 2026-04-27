# 03 — Routes

All UI routes are locale-prefixed. The locale segment is `[locale]` and
must be one of `vi` or `en` (see [routing.ts](../../i18n/routing.ts)).

## Public

| Path                              | Purpose                              | Auth     |
| --------------------------------- | ------------------------------------ | -------- |
| `/[locale]/`                      | Landing                              | -        |
| `/[locale]/search`                | BR1 search                           | -        |
| `/[locale]/supplements/[slug]`    | BR1 supplement detail                | -        |
| `/[locale]/quality-index`         | BR1 ranked tiers                     | -        |
| `/[locale]/feed`                  | BR1 curated content (personalized when logged in) | -      |
| `/[locale]/pricing`               | Free vs Pro                          | -        |
| `/[locale]/login`                 | Auth                                 | -        |
| `/[locale]/register`              | Auth                                 | -        |

## Authenticated

| Path                            | Purpose                              |
| ------------------------------- | ------------------------------------ |
| `/[locale]/dashboard`           | BR2 today's regimen + streak         |
| `/[locale]/dashboard/regimen`   | BR2 build/edit regimens              |
| `/[locale]/dashboard/log`       | BR2 quick log                        |
| `/[locale]/dashboard/analytics` | BR2 trends                           |
| `/[locale]/chat`                | BR4 RAG assistant                    |
| `/[locale]/account/billing`     | Subscription state + SePay QR        |

## API

| Path                              | Purpose                                  |
| --------------------------------- | ---------------------------------------- |
| `/api/auth/callback`              | Supabase OAuth callback                  |
| `/api/cron/ingest-dsld`           | Daily NIH ODS DSLD pull (cron-only)      |
| `/api/cron/ingest-pubmed`         | Daily PubMed pull (cron-only)            |
| `/api/cron/ingest-openfda`        | Daily OpenFDA recalls (cron-only)        |
| `/api/cron/dispatch-reminders`    | 5-minute push/email scheduler (cron-only)|
| `/api/webhooks/sepay`             | SePay transaction webhook (IP-allow-list) |
| `/api/push/subscribe`             | Save user's Web Push subscription        |
| `/api/chat`                       | RAG streaming endpoint (AI SDK)          |

The proxy at [proxy.ts](../../proxy.ts) enforces locale matching and
gates `/dashboard`, `/account`, and `/chat` to authenticated users
(redirecting to `/[locale]/login?next=...`).
