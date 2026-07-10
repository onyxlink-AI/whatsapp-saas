-- ============================================================
-- Post-deploy cron: Recuperación de Leads Fríos con IA — once a day
--
-- Same mechanism as schedule-buffer-flush.sql (pg_cron + pg_net calling the
-- Vercel route over HTTP). Not a migration for the same reason: needs the
-- live prod URL and CRON_SECRET.
--
-- HOW to run: replace the two placeholders with the values from your
-- .env.local / Vercel env, then run this in the Supabase dashboard -> SQL
-- Editor (or `supabase db query --linked -f this-file.sql` after
-- substituting). Idempotent: re-running updates the existing job in place.
--
--   __APP_URL__      -> NEXT_PUBLIC_APP_URL  (e.g. https://your-app.vercel.app -- NO trailing slash)
--   __CRON_SECRET__  -> CRON_SECRET
-- ============================================================

select cron.schedule(
  'cold-lead-recovery',
  '0 14 * * *',             -- once a day, 14:00 UTC
  $job$
    select net.http_get(
      url     := '__APP_URL__/api/cron/cold-lead-recovery',
      headers := jsonb_build_object('Authorization', 'Bearer __CRON_SECRET__')
    );
  $job$
);

-- Verify it registered (expect one active row):
--   select jobname, schedule, active from cron.job where jobname = 'cold-lead-recovery';
--
-- Inspect recent runs / failures:
--   select status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'cold-lead-recovery')
--   order by start_time desc limit 10;
--
-- Remove the job:
--   select cron.unschedule('cold-lead-recovery');
