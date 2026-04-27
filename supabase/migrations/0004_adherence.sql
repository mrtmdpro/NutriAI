-- Sprint 4: Adherence Tracking (BR2).
--
-- Tables:
--   regimens             — user-owned routines, with timezone
--   regimen_items        — per-supplement items in a regimen with schedule
--   intake_log           — append-only log of taken doses
--   push_subscriptions   — Web Push VAPID subscriptions per user
--   reminder_log         — per-fired-reminder bookkeeping (idempotency)
--
-- All user-owned tables use RLS so users see only their own rows; the
-- service-role client (used by the reminder cron) bypasses RLS.

create extension if not exists "pgcrypto" with schema extensions;

-- regimens
create table if not exists public.regimens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- IANA timezone name. Defaults to Asia/Ho_Chi_Minh; users can change
  -- per-regimen if e.g. they're traveling. The reminder cron does its
  -- next-fire calculation in this timezone.
  timezone text not null default 'Asia/Ho_Chi_Minh',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists regimens_user_idx on public.regimens (user_id);

drop trigger if exists set_updated_at on public.regimens;
create trigger set_updated_at before update on public.regimens
  for each row execute function public.tg_set_updated_at();

alter table public.regimens enable row level security;

drop policy if exists "regimens_self_select" on public.regimens;
create policy "regimens_self_select" on public.regimens
  for select using (auth.uid() = user_id);

drop policy if exists "regimens_self_insert" on public.regimens;
create policy "regimens_self_insert" on public.regimens
  for insert with check (auth.uid() = user_id);

drop policy if exists "regimens_self_update" on public.regimens;
create policy "regimens_self_update" on public.regimens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "regimens_self_delete" on public.regimens;
create policy "regimens_self_delete" on public.regimens
  for delete using (auth.uid() = user_id);

-- regimen_items
create table if not exists public.regimen_items (
  id uuid primary key default gen_random_uuid(),
  regimen_id uuid not null references public.regimens (id) on delete cascade,
  -- Either supplement_id (links to the Knowledge Hub) OR free-form
  -- label (for items the user types in but isn't in our DB).
  supplement_id uuid references public.supplements (id) on delete set null,
  label text not null,
  dose numeric,
  unit text,
  -- ARRAY of integers 0–6 (Sunday=0). Empty array == every day.
  days_of_week int[] not null default '{0,1,2,3,4,5,6}',
  -- ARRAY of "HH:MM" strings (24h, in regimen timezone).
  times_of_day text[] not null default '{}',
  notify_push boolean not null default true,
  notify_email boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regimen_items_dose_unit check (
    (dose is null and unit is null) or (dose is not null and unit is not null)
  )
);

create index if not exists regimen_items_regimen_idx on public.regimen_items (regimen_id);
create index if not exists regimen_items_supplement_idx on public.regimen_items (supplement_id);

drop trigger if exists set_updated_at on public.regimen_items;
create trigger set_updated_at before update on public.regimen_items
  for each row execute function public.tg_set_updated_at();

alter table public.regimen_items enable row level security;

-- Items inherit the parent regimen's owner via a join check.
drop policy if exists "regimen_items_self_select" on public.regimen_items;
create policy "regimen_items_self_select" on public.regimen_items
  for select using (
    exists (
      select 1 from public.regimens r
      where r.id = regimen_items.regimen_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "regimen_items_self_write" on public.regimen_items;
create policy "regimen_items_self_write" on public.regimen_items
  for all using (
    exists (
      select 1 from public.regimens r
      where r.id = regimen_items.regimen_id and r.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.regimens r
      where r.id = regimen_items.regimen_id and r.user_id = auth.uid()
    )
  );

-- intake_log: append-only record of when a user took a dose
create table if not exists public.intake_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  regimen_item_id uuid not null references public.regimen_items (id) on delete cascade,
  -- The "scheduled time slot" this intake satisfies — used by adherence
  -- analytics to compute on-time vs late.
  scheduled_for timestamptz not null,
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- One intake per scheduled slot per user. A user can edit/replace via
  -- ON CONFLICT in the action.
  unique (user_id, regimen_item_id, scheduled_for)
);

create index if not exists intake_log_user_taken_idx on public.intake_log (user_id, taken_at desc);
create index if not exists intake_log_item_idx on public.intake_log (regimen_item_id);

alter table public.intake_log enable row level security;

drop policy if exists "intake_log_self_select" on public.intake_log;
create policy "intake_log_self_select" on public.intake_log
  for select using (auth.uid() = user_id);

drop policy if exists "intake_log_self_insert" on public.intake_log;
create policy "intake_log_self_insert" on public.intake_log
  for insert with check (auth.uid() = user_id);

drop policy if exists "intake_log_self_delete" on public.intake_log;
create policy "intake_log_self_delete" on public.intake_log
  for delete using (auth.uid() = user_id);

-- push_subscriptions: VAPID Web Push registrations
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subs_self" on public.push_subscriptions;
create policy "push_subs_self" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- reminder_log: idempotency for the dispatcher cron
create table if not exists public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  regimen_item_id uuid not null references public.regimen_items (id) on delete cascade,
  scheduled_for timestamptz not null,
  channel text not null check (channel in ('push', 'email')),
  fired_at timestamptz not null default now(),
  ok boolean not null default true,
  error text,
  unique (regimen_item_id, scheduled_for, channel)
);

create index if not exists reminder_log_fired_idx on public.reminder_log (fired_at desc);

-- No RLS on reminder_log: only the service-role client writes/reads it.

comment on table public.regimens is 'BR2: user routines. RLS-scoped to owner.';
comment on table public.regimen_items is 'BR2: items inside a regimen with schedule + notification prefs.';
comment on table public.intake_log is 'BR2: append-only log of doses taken.';
comment on table public.push_subscriptions is 'BR2: Web Push VAPID subscriptions per user.';
comment on table public.reminder_log is 'BR2: idempotency record for the dispatch-reminders cron.';
