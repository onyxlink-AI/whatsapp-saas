-- ============================================================
-- Post-deploy cron: recordatorios y seguimiento (motor multi-paso) — cada 10 minutos
--
-- Same mechanism as schedule-appointment-reminders.sql / schedule-buffer-flush.sql
-- (pg_cron + pg_net calling the Vercel route over HTTP). Not a migration for
-- the same reason: needs the live prod URL and CRON_SECRET.
--
--   __APP_URL__      -> NEXT_PUBLIC_APP_URL  (e.g. https://your-app.vercel.app -- NO trailing slash)
--   __CRON_SECRET__  -> CRON_SECRET
-- ============================================================

select cron.schedule(
  'reminders-process',
  '*/10 * * * *',
  $job$
    select net.http_get(
      url     := '__APP_URL__/api/cron/reminders/process',
      headers := jsonb_build_object('Authorization', 'Bearer __CRON_SECRET__')
    );
  $job$
);

-- Verify: select jobname, schedule, active from cron.job where jobname = 'reminders-process';
-- Remove: select cron.unschedule('reminders-process');
