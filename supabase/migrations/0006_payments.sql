-- Sprint 6: SePay.vn payment reconciliation.
--
-- Tables:
--   subscriptions    — one Pro subscription per user (nullable for free tier)
--   payment_events   — raw SePay webhook payloads (audit + idempotency)
--
-- The flow:
--   1. /api/payments/start creates a `subscriptions` row in `pending`
--      with a unique `payment_code` (memo string).
--   2. UI shows VietQR encoding bank account + amount + memo.
--   3. SePay POSTs to /api/webhooks/sepay when the bank receives the
--      transfer.
--   4. Webhook persists the raw payload (idempotent on `id`), matches
--      `content` against `payment_code`, sets the subscription active,
--      and bumps `profiles.pro_until`.

create extension if not exists "pgcrypto" with schema extensions;

----------------------------------------------------------------------
-- subscriptions
----------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type subscription_status as enum ('pending', 'active', 'canceled', 'expired');
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_period') then
    create type subscription_period as enum ('monthly', 'yearly');
  end if;
end$$;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payment_code text not null unique,
  status subscription_status not null default 'pending',
  period subscription_period not null,
  amount_vnd integer not null,
  activated_at timestamptz,
  expires_at timestamptz,
  -- The matching SePay event_id once paid; null while pending.
  sepay_event_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

drop trigger if exists set_updated_at on public.subscriptions;
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_self_select" on public.subscriptions;
create policy "subscriptions_self_select" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Inserts and updates flow through the service-role client only
-- (start-checkout action runs as user but uses service-role to set
-- payment_code; the webhook always uses service-role).
-- A self-insert policy lets the start-checkout action use the cookie
-- client if we ever want to.
drop policy if exists "subscriptions_self_insert" on public.subscriptions;
create policy "subscriptions_self_insert" on public.subscriptions
  for insert with check (auth.uid() = user_id);

----------------------------------------------------------------------
-- payment_events: raw SePay webhook payloads
----------------------------------------------------------------------
create table if not exists public.payment_events (
  -- SePay event id is the natural primary key for idempotency.
  id bigint primary key,
  payload jsonb not null,
  matched_subscription_id uuid references public.subscriptions (id),
  received_at timestamptz not null default now()
);

create index if not exists payment_events_received_idx on public.payment_events (received_at desc);

-- payment_events is service-role-only; no RLS policies. Enabling RLS
-- without policies blocks anonymous + authenticated access.
alter table public.payment_events enable row level security;

comment on table public.subscriptions is
  'BR2 monetization: Pro subscriptions reconciled via SePay bank transfer.';
comment on table public.payment_events is
  'Audit + idempotency record of SePay webhook deliveries.';
