-- Sprint 7+: schedule cron jobs from Postgres so we're not constrained
-- by Vercel Hobby's 2-daily-crons limit.
--
-- This migration uses Supabase's `pg_cron` + `http` extensions to call
-- our /api/cron/* endpoints directly. The Vercel-side `vercel.json`
-- crons section is empty; once you upgrade to Vercel Pro you may
-- migrate back to Vercel-managed crons (a 5-minute schedule needs Pro).
--
-- Required env at SQL time:
--   - app.settings.cron_secret = the same value as Vercel CRON_SECRET
--   - app.settings.api_origin  = the deployed origin (e.g. https://nutriai.vercel.app)
--
-- Set them in Supabase via Settings → Database → Custom Postgres Config:
--   ALTER DATABASE postgres SET app.settings.cron_secret = '<value>';
--   ALTER DATABASE postgres SET app.settings.api_origin  = 'https://<your-domain>';
-- Or run in the SQL editor (the SECURITY DEFINER function below reads
-- them at fire time).

create extension if not exists pg_cron;
create extension if not exists http;

-- Wrapper that fires a GET to a cron path with the Authorization header.
-- SECURITY DEFINER so non-superuser callers (cron) can read app
-- settings; locked down to public schema.
create or replace function public.fire_cron(path text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  api_origin  text := current_setting('app.settings.api_origin', true);
  cron_secret text := current_setting('app.settings.cron_secret', true);
  resp        http_response;
begin
  if api_origin is null or cron_secret is null then
    raise notice 'fire_cron: api_origin or cron_secret unset; skipping %', path;
    return;
  end if;

  resp := http((
    'GET',
    api_origin || path,
    array[
      http_header('Authorization', 'Bearer ' || cron_secret)
    ],
    null,
    null
  )::http_request);

  raise notice 'fire_cron % → %', path, resp.status;
end;
$$;

-- Drop any prior schedules so this migration is idempotent on replay.
-- The loop variable is `_id` (not `jobid`) to avoid an ambiguous column
-- reference against `cron.job.jobid`.
do $$
declare
  _id bigint;
begin
  for _id in select j.jobid from cron.job j where j.jobname like 'nutriai-%'
  loop
    perform cron.unschedule(_id);
  end loop;
end$$;

-- Schedule the three ingest jobs daily, staggered.
select cron.schedule(
  'nutriai-ingest-dsld',
  '0 2 * * *',
  $cron$select public.fire_cron('/api/cron/ingest-dsld');$cron$
);
select cron.schedule(
  'nutriai-ingest-pubmed',
  '30 2 * * *',
  $cron$select public.fire_cron('/api/cron/ingest-pubmed');$cron$
);
select cron.schedule(
  'nutriai-ingest-openfda',
  '0 3 * * *',
  $cron$select public.fire_cron('/api/cron/ingest-openfda');$cron$
);

-- Reminder dispatcher every 5 minutes — Hobby-tier-friendly because
-- pg_cron has no schedule cadence cap.
select cron.schedule(
  'nutriai-dispatch-reminders',
  '*/5 * * * *',
  $cron$select public.fire_cron('/api/cron/dispatch-reminders');$cron$
);
