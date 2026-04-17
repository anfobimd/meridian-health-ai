-- 20260416070000 — Schedule dead edge functions via pg_cron
-- ai-risk-scoring: daily at 02:00 UTC (churn scores)
-- provider-daily-notify: daily at 07:00 UTC (provider morning briefing)

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  supabase_url TEXT := current_setting('app.settings.supabase_url', true);
  anon_key TEXT := current_setting('app.settings.supabase_anon_key', true);
BEGIN
  -- If settings aren't configured, skip (admin configures via Supabase dashboard)
  IF supabase_url IS NULL OR anon_key IS NULL THEN
    RAISE NOTICE 'Skipping cron — configure app.settings.supabase_url and app.settings.supabase_anon_key, then re-run';
    RETURN;
  END IF;

  -- Daily patient risk scoring at 02:00 UTC
  PERFORM cron.schedule(
    'ai-risk-scoring-daily',
    '0 2 * * *',
    format(
      $cron$SELECT net.http_post(
        url := '%s/functions/v1/ai-risk-scoring',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('trigger','cron')
      );$cron$,
      supabase_url, anon_key
    )
  );

  -- Daily provider briefing at 07:00 UTC
  PERFORM cron.schedule(
    'provider-daily-notify',
    '0 7 * * *',
    format(
      $cron$SELECT net.http_post(
        url := '%s/functions/v1/provider-daily-notify',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('trigger','cron')
      );$cron$,
      supabase_url, anon_key
    )
  );
END $$;

-- Manual setup instructions (run in Supabase SQL editor once):
--
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR-PROJECT.supabase.co';
--   ALTER DATABASE postgres SET app.settings.supabase_anon_key = 'YOUR-ANON-KEY';
--
-- Then re-run this migration, or run the DO block above manually.
