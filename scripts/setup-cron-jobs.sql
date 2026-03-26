-- 003_cron_jobs.sql
-- pg_cron schedules. Requires pg_cron and pg_net extensions enabled in the dashboard.
--
-- Jobs registered here:
--   1. poll-prices-hourly      — triggers the poll-prices Edge Function every hour
--   2. aggregate-daily-prices  — rolls up hourly snapshots → daily at midnight
--
-- IMPORTANT: Replace <PROJECT_REF> with your actual Supabase project reference ID
-- before running this migration. Find it in: Project Settings → General → Reference ID

-- ── 1. Hourly price polling ───────────────────────────────────────────────────
-- Calls the poll-prices Edge Function via pg_net.
-- The Edge Function verifies the service role key before processing.

SELECT cron.schedule(
  'poll-prices-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/poll-prices',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── 2. Daily aggregation + cleanup ───────────────────────────────────────────
-- Runs at 00:05 each night (just after midnight) to:
--   a. Roll up the previous day's hourly snapshots into price_history_daily
--   b. Delete raw snapshots older than 7 days (storage management)
--   c. Clear expired search cache entries

SELECT cron.schedule(
  'aggregate-daily-prices',
  '5 0 * * *',
  $$
  -- Roll up hourly → daily
  INSERT INTO price_history_daily (vendor_product_id, date, price_min, price_max, price_avg)
  SELECT
    vendor_product_id,
    DATE(recorded_at AT TIME ZONE 'UTC') AS date,
    MIN(price),
    MAX(price),
    ROUND(AVG(price), 2)
  FROM price_snapshots
  WHERE recorded_at < now() - INTERVAL '1 day'
  GROUP BY vendor_product_id, DATE(recorded_at AT TIME ZONE 'UTC')
  ON CONFLICT (vendor_product_id, date) DO NOTHING;

  -- Remove raw snapshots older than 7 days
  DELETE FROM price_snapshots
  WHERE recorded_at < now() - INTERVAL '7 days';

  -- Clear expired search cache (30-min TTL)
  DELETE FROM search_cache
  WHERE cached_at < now() - INTERVAL '30 minutes';
  $$
);
