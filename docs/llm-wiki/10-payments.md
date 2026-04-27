# 10 — Payments (SePay)

SePay is a VN-native gateway that does **bank-transfer
reconciliation**. We never touch card data. The flow:

```
User clicks Upgrade
   │
   ▼
Server Action `startPayment(period)`
  - generates `payment_code = "NUTRI<userId8><nano8>"`
  - inserts subscriptions row {status: 'pending', period, amount_vnd}
   │
   ▼
UI renders VietQR via /api/payments/qr proxy
  → 302 to img.vietqr.io with bank/account/amount/memo
   │
   ▼
User opens banking app, transfers
   │
   ▼
Bank receives, SePay POSTs to /api/webhooks/sepay
   │
   ├── verify source IP in SEPAY_IP_ALLOWLIST
   ├── verify Authorization == "Apikey ${SEPAY_API_KEY}"
   ├── insert payment_events {id, payload}        ← idempotent on id
   ├── extract NUTRI<...> from payload.content
   ├── join to subscriptions.payment_code
   ├── verify amount_vnd ≤ transferAmount
   └── update subscriptions.status='active' + profiles.plan='pro' + pro_until
   │
   ▼
Pending panel polls /account/billing every 8s, picks up active state
```

## Files

- [`supabase/migrations/0006_payments.sql`](../../supabase/migrations/0006_payments.sql)
  — `subscriptions` + `payment_events` tables.
- [`lib/payments/sepay.ts`](../../lib/payments/sepay.ts) —
  `PRICING`, `generatePaymentCode`, `buildVietQrImageUrl`,
  `SEPAY_IP_ALLOWLIST`.
- [`lib/payments/actions.ts`](../../lib/payments/actions.ts) —
  `startPayment`, `cancelPendingSubscription`.
- [`lib/payments/queries.ts`](../../lib/payments/queries.ts) —
  `listSubscriptions`.
- [`app/api/webhooks/sepay/route.ts`](../../app/api/webhooks/sepay/route.ts)
  — webhook handler (always returns 200).
- [`app/api/payments/qr/route.ts`](../../app/api/payments/qr/route.ts)
  — auth-gated VietQR image proxy.
- [`app/[locale]/pricing/page.tsx`](../../app/[locale]/pricing/page.tsx)
  — Free vs Pro card.
- [`app/[locale]/account/billing/page.tsx`](../../app/[locale]/account/billing/page.tsx)
  — current plan, upgrade form, pending QR panel, history.
- [`components/upgrade-form.tsx`](../../components/upgrade-form.tsx),
  [`components/pending-payment-panel.tsx`](../../components/pending-payment-panel.tsx).

## Pricing

`lib/payments/sepay.ts → PRICING`:

| Period   | VND        | Days |
| -------- | ---------- | ---- |
| monthly  | 199,000    | 31   |
| yearly   | 1,990,000  | 366  |

## Renewal

We do not auto-debit (bank transfer model can't). When `pro_until` is
within 7 days, the dashboard surfaces a renewal CTA that re-runs the
payment-code flow with a new code — it doesn't touch the existing
active subscription until the new payment lands.

## Webhook security

| Layer         | Check                                                    |
| ------------- | -------------------------------------------------------- |
| Network       | `x-forwarded-for[0]` ∈ `SEPAY_IP_ALLOWLIST`              |
| Application   | `authorization == "Apikey " + SEPAY_API_KEY`             |
| Domain        | `payment_code` regex match in `payload.content`          |
| Cardinality   | UNIQUE constraint on `payment_events.id`                 |
| Amount        | `transferAmount >= subscriptions.amount_vnd`             |

Failures from any layer return 200 to SePay (so they don't retry) and
log the reason; manual reconciliation runs against `payment_events`.

## Sandbox

- Test environment: `my.dev.sepay.vn`. Use a sandbox bank account +
  simulated transactions.
