-- Sprint 1 follow-up: lock down which columns of `profiles` an authenticated
-- user can mutate.
--
-- The RLS policy `profiles_update_self` allows a user to UPDATE the row
-- whose `id` matches their auth.uid(), but PostgreSQL RLS does not gate
-- *which columns* are written. Without column-level grants, an
-- authenticated user could `update profiles set plan = 'pro'` and grant
-- themselves a paid subscription.
--
-- Fix: revoke the blanket UPDATE on the table from the `authenticated`
-- role and re-grant UPDATE only on `locale` (the only field a user
-- legitimately edits from the client). All other columns remain
-- writable only via the service-role client (cron, webhooks).

revoke update on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (locale) on table public.profiles to authenticated;

-- Restate the policy unchanged so a future maintainer reading just this
-- file sees the full picture. The combination of:
--   - row policy: profiles_update_self (auth.uid() = id)
--   - column grant: UPDATE (locale) to authenticated
-- means an authenticated user can only update `locale` on their own row.

comment on policy "profiles_update_self" on public.profiles is
  'Self-only UPDATE. Combined with column-level grants, only `locale` is mutable from the client. plan and pro_until are mutated only by the service-role client.';
