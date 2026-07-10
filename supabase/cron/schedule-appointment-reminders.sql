-- ============================================================
-- Post-deploy cron: appointment reminders — every 15 minutes
--
-- Same mechanism as schedule-buffer-flush.sql / schedule-cold-lead-recovery.sql
-- (pg_cron + pg_net calling the Vercel route over HTTP). Not a migration for
-- the same reason: needs the live prod URL and CRON_SECRET.
--
--   __APP_URL__      -> NEXT_PUBLIC_APP_URL  (e.g. https://your-app.vercel.app -- NO trailing slash)
--   __CRON_SECRET__  -> CRON_SECRET
-- ============================================================

select cron.schedule(
  'appointment-reminders',
  '*/15 * * * *',
  $job$
    select net.http_get(
      url     := '__APP_URL__/api/cron/appointment-reminders',
      headers := jsonb_build_object('Authorization', 'Bearer __CRON_SECRET__')
    );
  $job$
);

-- Verify: select jobname, schedule, active from cron.job where jobname = 'appointment-reminders';
-- Remove: select cron.unschedule('appointment-reminders');
