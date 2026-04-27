# 09 — Adherence (BR2)

## Tables

| Table                   | Owner | Purpose                                            |
| ----------------------- | ----- | -------------------------------------------------- |
| `regimens`              | RLS   | Per-user routine container, with IANA timezone.    |
| `regimen_items`         | RLS   | Items in a regimen with schedule + notification flags. |
| `intake_log`            | RLS   | Append-only record of doses taken.                 |
| `push_subscriptions`    | RLS   | Web Push VAPID subscriptions.                      |
| `reminder_log`          | -     | Idempotency for the dispatcher cron (service-role only). |

Schedule is stored as:
- `days_of_week int[]` — values 0-6, Sunday=0. Empty array = every day.
- `times_of_day text[]` — `"HH:MM"` strings, in the regimen's IANA timezone.

The dispatcher cron and "today's schedule" view both translate
`(YYYY-MM-DD, HH:MM, timezone)` → absolute UTC instants via
`Intl.DateTimeFormat` round-trips, so DST is handled correctly.

## Key code paths

- [`lib/adherence/queries.ts`](../../lib/adherence/queries.ts):
  `getTodaySchedule`, `listRegimens`, `getAdherenceStats`.
- [`lib/adherence/actions.ts`](../../lib/adherence/actions.ts):
  Server Actions — `saveRegimen`, `deleteRegimen`, `logIntake`, `unlogIntake`.
- [`lib/push/server.ts`](../../lib/push/server.ts): VAPID-signed Web
  Push send, with dead-subscription cleanup.
- [`lib/push/actions.ts`](../../lib/push/actions.ts): `saveSubscription`,
  `getPushPublicKey`.
- [`public/sw.js`](../../public/sw.js): Web Push service worker.
- [`lib/reminders/email.ts`](../../lib/reminders/email.ts): Resend
  transport, lazy-constructed.
- [`app/api/cron/dispatch-reminders/route.ts`](../../app/api/cron/dispatch-reminders/route.ts):
  every-5-minute cron that fires push + email per channel.
- [`components/regimen-builder.tsx`](../../components/regimen-builder.tsx):
  multi-item form with preset time chips and day-of-week toggles.
- [`components/intake-toggle.tsx`](../../components/intake-toggle.tsx):
  one-tap optimistic toggle.
- [`components/adherence-trend-chart.tsx`](../../components/adherence-trend-chart.tsx)
  + [`adherence-heatmap.tsx`](../../components/adherence-heatmap.tsx):
  recharts line + 12-week heatmap.

## Reminder dispatch contract

Every 5 minutes Vercel Cron hits `/api/cron/dispatch-reminders` with
`Authorization: Bearer ${CRON_SECRET}`. The handler:

1. Fetches all enabled `regimen_items` whose parent regimen is enabled.
2. For each item, computes the schedule slots for "today" in the
   item's regimen timezone, then keeps slots that fall within
   `[now - 5min, now]`.
3. Filters by `days_of_week` for the slot's local date.
4. Per (item, slot, channel), tries to insert a `reminder_log` row.
   Unique-violation = already fired; skip.
5. If insert succeeded, sends:
   - **Push**: VAPID-signed via `web-push` to all `push_subscriptions`
     for the user. 404/410 from the push service drops the
     subscription.
   - **Email**: Resend with the user's `profiles.email`.

## Analytics

`getAdherenceStats(days)` returns:
- `adherenceRate` — fraction of scheduled doses taken in the last
  `days` days
- `weeklyAdherenceRate` — fraction in the last 7 days
- `currentStreak` — consecutive days with ≥80% of slots taken
- `heatmap` — `{date, total, taken}[]` for the last 12 weeks
- `weeklyTrend` — 12-week rolling weekly rate

Computation is in-memory; max ~2.5k logical rows per user over 12
weeks. Will move to a Postgres function if read-volume warrants.
