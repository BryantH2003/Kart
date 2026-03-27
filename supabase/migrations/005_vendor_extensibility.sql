-- 005_vendor_extensibility.sql
-- Future-proofs the schema for onboarding vendors beyond CheapShark.
-- All changes are additive (new columns, new indexes, constraint adjustments).
-- No existing columns removed. Safe to apply on a database with or without data.

-- ── vendors ───────────────────────────────────────────────────────────────────
-- Adds a vendor_type column so adapters and services can branch on behavior
-- without hardcoding vendor IDs in application logic.
--
-- aggregator  → one entry, provides data from many underlying stores (CheapShark, ITAD)
-- retailer    → single storefront, fixed prices, inventory-managed (Steam, Best Buy, GOG)
-- marketplace → user/third-party listings, variable prices per seller (eBay, Amazon)

ALTER TABLE vendors
  ADD COLUMN vendor_type TEXT NOT NULL DEFAULT 'retailer'
  CHECK (vendor_type IN ('aggregator', 'retailer', 'marketplace'));

UPDATE vendors SET vendor_type = 'aggregator' WHERE id = 'cheapshark';
-- All storefront rows (steam, gog, humble, etc.) keep the 'retailer' default.

-- ── canonical_products ────────────────────────────────────────────────────────
-- Problem: external_id TEXT UNIQUE assumes every product has one universal ID
-- living in a single namespace. Adding physical goods (UPC), eBay listings
-- (Item ID), or Amazon products (ASIN) risks collisions and ambiguity.
--
-- Fix:
--   1. Add external_id_type to name the identifier namespace.
--   2. Drop the single-column UNIQUE constraint.
--   3. Replace with a partial composite unique: (type, id) when both are present.
--      NULL external_ids are allowed for products pending canonical ID resolution.
--
-- Identifier type examples:
--   steam_app_id  → Steam Application ID (stable across all gaming APIs)
--   upc           → Universal Product Code (physical goods, 12 digits)
--   gtin          → Global Trade Item Number (superset of UPC/EAN)
--   asin          → Amazon Standard Identification Number
--   isbn          → International Standard Book Number

ALTER TABLE canonical_products
  ADD COLUMN external_id_type TEXT;

ALTER TABLE canonical_products
  DROP CONSTRAINT canonical_products_external_id_key;

CREATE UNIQUE INDEX idx_canonical_products_external_id
  ON canonical_products(external_id_type, external_id)
  WHERE external_id IS NOT NULL AND external_id_type IS NOT NULL;

-- Update existing rows so they carry the correct type label.
-- CheapShark products are identified by Steam App ID.
UPDATE canonical_products
  SET external_id_type = 'steam_app_id'
  WHERE external_id IS NOT NULL;

-- Flexible spill bucket for category-specific fields that don't belong as
-- permanent columns (avoids schema churn as new product categories are added).
-- Examples: { "genres": ["Strategy"], "dlc_count": 3 } for games
--           { "weight_kg": 0.5, "dimensions": "10x5x2cm" } for physical goods
ALTER TABLE canonical_products
  ADD COLUMN metadata JSONB;

-- ── vendor_products ───────────────────────────────────────────────────────────
-- Vendor-specific static product data that doesn't belong in canonical_products.
-- Each adapter populates this with whatever the vendor returns.
-- Examples:
--   CheapShark/Steam  → { "genres": ["Strategy", "Turn-Based"] }
--   eBay              → { "condition": "Used", "seller_id": "user123", "location": "CA" }
--   Best Buy          → { "model_number": "X123", "upc": "012345678901" }
ALTER TABLE vendor_products
  ADD COLUMN metadata JSONB;

-- Soft-delete flag for listings that are no longer active.
-- Set to false instead of deleting the row so price history is preserved.
-- Use cases:
--   eBay listing ended or sold
--   Best Buy SKU discontinued
--   Steam game delisted
-- The polling job skips inactive vendor_products.
ALTER TABLE vendor_products
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Sync observability: track the outcome of the last poll attempt.
-- pending  → not yet synced (new row or just created)
-- success  → last sync completed without error
-- error    → last sync failed (see sync_error for detail)
-- skipped  → intentionally skipped this cycle (e.g. rate limit back-off)
ALTER TABLE vendor_products
  ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (sync_status IN ('pending', 'success', 'error', 'skipped'));

ALTER TABLE vendor_products
  ADD COLUMN sync_error TEXT;  -- null on success, error message on failure

-- Composite partial index for the polling job's primary query:
--   "find active vendor_products that are on a wishlist, ordered by stalest first"
-- Only indexes active rows — inactive rows are never polled.
CREATE INDEX idx_vendor_products_poll_queue
  ON vendor_products(last_synced NULLS FIRST)
  WHERE is_active = true;

-- ── price_snapshots ───────────────────────────────────────────────────────────
-- Extend the availability enum to include pre_order, which doesn't fit any of
-- the existing 3 values. Changing CHECK constraints requires a drop + re-add.
-- Doing this now avoids a migration on a table with millions of rows later.

ALTER TABLE price_snapshots
  DROP CONSTRAINT price_snapshots_availability_check;

ALTER TABLE price_snapshots
  ADD CONSTRAINT price_snapshots_availability_check
  CHECK (availability IN ('in_stock', 'out_of_stock', 'limited', 'pre_order'));
