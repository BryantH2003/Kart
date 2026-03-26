-- 001_initial_schema.sql
-- Core tables for Kart: vendors, canonical products, vendor products,
-- price snapshots, price history, search cache, wishlists, and alert log.

-- Vendor registry (config-driven — new vendors added here only)
CREATE TABLE vendors (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  config  JSONB
);

-- Canonical (vendor-agnostic) products
-- external_id is the universal matching key:
--   games         → Steam App ID (stable across gaming APIs)
--   physical goods → UPC/GTIN (when added in future)
-- release_date    → sourced from CheapShark releaseDate (Unix timestamp converted)
-- metacritic_score → sourced from CheapShark metacriticScore (0 = unscored)
CREATE TABLE canonical_products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id      TEXT UNIQUE,
  name             TEXT NOT NULL,
  brand            TEXT,
  category         TEXT,
  image_url        TEXT,
  release_date     TIMESTAMPTZ,
  metacritic_score INT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Per-vendor product entries
-- One row per vendor that carries this product
CREATE TABLE vendor_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id      UUID REFERENCES canonical_products ON DELETE CASCADE,
  vendor_id         TEXT REFERENCES vendors,
  vendor_product_id TEXT NOT NULL,       -- vendor's internal ID (CheapShark gameID, ASIN, SKU, etc.)
  product_url       TEXT,
  last_synced       TIMESTAMPTZ,
  UNIQUE(vendor_id, vendor_product_id)
);

-- Hourly price snapshots (raw — cleaned up after 7 days by pg_cron)
-- price         → cheapest salePrice across all stores
-- original_price → normalPrice from the cheapest deal
-- rating        → steamRatingPercent / 10 (0–10 scale)
-- rating_text   → steamRatingText e.g. "Overwhelmingly Positive" (stored explicitly for display)
-- store_prices  → per-store breakdown: [{ storeName, storeId, price, dealUrl }]
CREATE TABLE price_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_product_id UUID REFERENCES vendor_products ON DELETE CASCADE,
  price             NUMERIC(10,2) NOT NULL,
  original_price    NUMERIC(10,2),
  availability      TEXT CHECK (availability IN ('in_stock', 'out_of_stock', 'limited')),
  rating            NUMERIC(3,1),
  rating_text       TEXT,
  review_count      INT,
  store_prices      JSONB,
  recorded_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_snapshots_vendor_product
  ON price_snapshots(vendor_product_id, recorded_at DESC);

-- Daily aggregated price history (kept permanently)
-- Rolled up from price_snapshots by pg_cron each night
CREATE TABLE price_history_daily (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_product_id UUID REFERENCES vendor_products ON DELETE CASCADE,
  date              DATE NOT NULL,
  price_min         NUMERIC(10,2),
  price_max         NUMERIC(10,2),
  price_avg         NUMERIC(10,2),
  UNIQUE(vendor_product_id, date)
);

-- Search result cache (30-min TTL — cleared by pg_cron)
CREATE TABLE search_cache (
  query_hash TEXT PRIMARY KEY,
  results    JSONB NOT NULL,
  cached_at  TIMESTAMPTZ DEFAULT now()
);

-- User wishlists
CREATE TABLE wishlists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users ON DELETE CASCADE,
  canonical_id UUID REFERENCES canonical_products ON DELETE CASCADE,
  target_price NUMERIC(10,2),     -- null = alert on any price drop
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, canonical_id)
);

-- Price alert log (records when alerts were sent — prevents duplicate sends)
CREATE TABLE alerts_sent (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users,
  vendor_product_id UUID REFERENCES vendor_products,
  triggered_price   NUMERIC(10,2),
  sent_at           TIMESTAMPTZ DEFAULT now()
);
