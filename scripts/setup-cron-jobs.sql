-- scripts/setup-cron-jobs.sql
-- Manual setup script for pg_cron jobs.
-- Run this ONCE against your Supabase project after:
--   1. Enabling pg_cron and pg_net extensions in Dashboard → Database → Extensions
--   2. Deploying the poll-prices Edge Function: supabase functions deploy poll-prices
--   3. Setting the cron secret: supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
--      (Copy the generated secret — you'll also add it to .env.local as CRON_SECRET=)
--
-- Replace <PROJECT_REF> with your Supabase project reference ID before running.
-- Find it in: Dashboard → Project Settings → General → Reference ID
--
-- Run with:
--   supabase db execute --file scripts/setup-cron-jobs.sql
-- Or paste into the Supabase SQL editor.
--
-- SECURITY NOTE: This file uses a CRON_SECRET (not the service role key).
-- The Edge Function verifies this secret. Never put the service role key in a cron job.

-- ── 1. Hourly price polling ───────────────────────────────────────────────────
-- Calls the poll-prices Edge Function via pg_net every hour.
-- The Edge Function verifies the Authorization header against CRON_SECRET.
--
-- Before running: replace <PROJECT_REF> and <CRON_SECRET> with real values.

SELECT cron.schedule(
  'poll-prices-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/poll-prices',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── 2. Daily aggregation + cleanup ───────────────────────────────────────────
-- Runs at 00:05 UTC each night to:
--   a. Roll up the previous day's hourly snapshots into price_history_daily
--   b. Delete raw snapshots older than 7 days (storage management)
--   c. Clear expired search cache entries (30-min TTL)

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
