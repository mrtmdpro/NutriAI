-- Sprint 7+: replace the current_setting()-based fire_cron with a
-- function the user calls once to wire schedules with inline values.
--
-- Why: Supabase managed Postgres doesn't grant superuser to the
-- `postgres` role, so `ALTER DATABASE postgres SET app.settings.X`
-- (which migration 0007 expected) returns `permission denied`. We
-- instead pass the origin + secret as arguments to a setup function
-- that bakes them into each cron.schedule command string. The values
-- are stored in `cron.job.command`, which is read-only to anon and
-- only writable by service-role.

set local search_path = public, extensions;

create or replace function public.setup_nutriai_cron(
  p_api_origin  text,
  p_cron_secret text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _id bigint;
  _cmd text;
begin
  if p_api_origin is null or length(p_api_origin) = 0
     or p_cron_secret is null or length(p_cron_secret) = 0 then
    raise exception 'setup_nutriai_cron: both p_api_origin and p_cron_secret are required';
  end if;

  -- Unschedule any prior nutriai-* jobs so the function is idempotent.
  for _id in select j.jobid from cron.job j where j.jobname like 'nutriai-%'
  loop
    perform cron.unschedule(_id);
  end loop;

  -- Build a single command template; substitute the path per schedule.
  -- We use the `http` extension (sync GET); pg_net would also work but
  -- isn't strictly needed for these short-running fire-and-forget calls.
  _cmd := format(
    $sql$select extensions.http((
      'GET',
      %L,
      array[extensions.http_header('Authorization', %L)],
      null,
      null
    )::extensions.http_request);$sql$,
    p_api_origin || '__PATH__',
    'Bearer ' || p_cron_secret
  );

  -- Schedule the four jobs with the same auth, varying only the path.
  perform cron.schedule(
    'nutriai-ingest-dsld',
    '0 2 * * *',
    replace(_cmd, '__PATH__', '/api/cron/ingest-dsld')
  );
  perform cron.schedule(
    'nutriai-ingest-pubmed',
    '30 2 * * *',
    replace(_cmd, '__PATH__', '/api/cron/ingest-pubmed')
  );
  perform cron.schedule(
    'nutriai-ingest-openfda',
    '0 3 * * *',
    replace(_cmd, '__PATH__', '/api/cron/ingest-openfda')
  );
  perform cron.schedule(
    'nutriai-dispatch-reminders',
    '*/5 * * * *',
    replace(_cmd, '__PATH__', '/api/cron/dispatch-reminders')
  );

  raise notice 'nutriai cron schedules installed for %', p_api_origin;
end;
$$;

comment on function public.setup_nutriai_cron is
  'Idempotently re-schedules all nutriai-* cron jobs with the given origin and CRON_SECRET. Run from the Supabase SQL editor as the postgres role.';

-- The legacy `fire_cron` from 0007 reads from app.settings.* which
-- can't be set on Supabase managed instances. Drop any prior schedules
-- that referenced it; the user is expected to call
-- `setup_nutriai_cron(...)` to re-install schedules with inline values.
do $$
declare
  _id bigint;
begin
  for _id in select j.jobid from cron.job j where j.jobname like 'nutriai-%'
  loop
    perform cron.unschedule(_id);
  end loop;
end$$;

-- fire_cron from 0007 is no longer used; drop it.
drop function if exists public.fire_cron(text);
