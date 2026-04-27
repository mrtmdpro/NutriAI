-- Sprint 1: profiles table + signup trigger.
--
-- Each row in `profiles` extends the corresponding `auth.users` record
-- with NutriAI-specific metadata: locale preference and subscription state.
-- Row-Level Security ensures a user can only read/update their own row;
-- service-role keys (cron, webhooks) can bypass RLS as needed.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  locale text not null default 'vi' check (locale in ('vi', 'en')),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  pro_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'User profile data. 1:1 with auth.users.id. Created automatically by handle_new_user trigger.';

-- Keep updated_at fresh on every UPDATE.
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- Row-Level Security
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-provision a profile when a new auth.users row is inserted.
-- Locale is read from the OAuth/sign-up metadata if provided
-- (e.g. {"locale": "vi"} in the user_metadata bag) and falls back to 'vi'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_locale text;
begin
  user_locale := coalesce(
    new.raw_user_meta_data ->> 'locale',
    'vi'
  );
  if user_locale not in ('vi', 'en') then
    user_locale := 'vi';
  end if;

  insert into public.profiles (id, email, locale)
  values (new.id, new.email, user_locale)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
