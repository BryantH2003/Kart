-- 004_indexes_and_optimizations.sql
-- Adds missing indexes and fixes structural issues identified during schema review.
-- All changes are non-destructive except the price_history_daily PK restructure,
-- which is safe pre-production (no data exists yet).

-- ── vendor_products ────────────────────────────────────────────────────────────
-- PostgreSQL does NOT auto-index foreign key columns.
-- canonical_id is used in every product page join (vendor_products → canonical_products).
-- Without this index, the join does a full table scan.
CREATE INDEX idx_vendor_products_canonical_id
  ON vendor_products(canonical_id);

-- last_synced is queried by the polling job to find products that need a refresh.
-- NULLS FIRST puts never-synced products at the front of the queue.
CREATE INDEX idx_vendor_products_last_synced
  ON vendor_products(last_synced NULLS FIRST);

-- ── price_snapshots ────────────────────────────────────────────────────────────
-- Standalone recorded_at index for the nightly cleanup job:
--   DELETE FROM price_snapshots WHERE recorded_at < now() - INTERVAL '7 days'
-- The composite index (vendor_product_id, recorded_at DESC) cannot efficiently
-- serve this query because vendor_product_id varies across all rows being deleted.
CREATE INDEX idx_price_snapshots_recorded_at
  ON price_snapshots(recorded_at);

-- ── price_history_daily ────────────────────────────────────────────────────────
-- The UUID primary key is never referenced externally — all queries go through
-- (vendor_product_id, date). Keeping the UUID creates two indexes for one logical key:
--   1. The UUID PK index (unused by any query)
--   2. The UNIQUE(vendor_product_id, date) index (the real access pattern)
--
-- Fix: drop the UUID column and promote the UNIQUE constraint to the primary key.
-- This saves one index, removes a meaningless surrogate key, and makes the table
-- schema self-documenting (the PK IS the natural key).
ALTER TABLE price_history_daily DROP CONSTRAINT price_history_daily_pkey;
ALTER TABLE price_history_daily DROP CONSTRAINT price_history_daily_vendor_product_id_date_key;
ALTER TABLE price_history_daily DROP COLUMN id;
ALTER TABLE price_history_daily ADD PRIMARY KEY (vendor_product_id, date);

-- ── search_cache ───────────────────────────────────────────────────────────────
-- cached_at index for the 30-min TTL cleanup job:
--   DELETE FROM search_cache WHERE cached_at < now() - INTERVAL '30 minutes'
-- Without this, the cleanup job full-scans the cache table on every run.
CREATE INDEX idx_search_cache_cached_at
  ON search_cache(cached_at);

-- ── wishlists ──────────────────────────────────────────────────────────────────
-- canonical_id index for the alert service query:
--   "which users have this product wishlisted at or below price X?"
-- UNIQUE(user_id, canonical_id) already covers user-first lookups but cannot
-- efficiently serve canonical_id-first lookups (wrong leading column).
CREATE INDEX idx_wishlists_canonical_id
  ON wishlists(canonical_id);

-- ── alerts_sent ────────────────────────────────────────────────────────────────
-- Composite index for the per-alert deduplication check in the polling job:
--   SELECT 1 FROM alerts_sent
--   WHERE user_id = $1 AND vendor_product_id = $2 AND sent_at > now() - INTERVAL '24 hours'
-- Called for every (user, product) pair on every poll cycle — must be fast.
CREATE INDEX idx_alerts_sent_dedup
  ON alerts_sent(user_id, vendor_product_id, sent_at DESC);
