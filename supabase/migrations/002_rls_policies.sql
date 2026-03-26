-- 002_rls_policies.sql
-- Row Level Security policies for all tables.
-- All policies live here as SQL — never configured through the Supabase dashboard.
-- This ensures policies are reproducible on any PostgreSQL host.

-- Enable RLS on every table
ALTER TABLE vendors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history_daily  ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_cache         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts_sent          ENABLE ROW LEVEL SECURITY;

-- ── Public catalog tables ─────────────────────────────────────────────────────
-- Anyone can read product, price, and vendor data.
-- No client-side INSERT/UPDATE/DELETE — only the service role (edge function) writes here.

CREATE POLICY "vendors_public_read"
  ON vendors FOR SELECT USING (true);

CREATE POLICY "canonical_products_public_read"
  ON canonical_products FOR SELECT USING (true);

CREATE POLICY "vendor_products_public_read"
  ON vendor_products FOR SELECT USING (true);

CREATE POLICY "price_snapshots_public_read"
  ON price_snapshots FOR SELECT USING (true);

CREATE POLICY "price_history_daily_public_read"
  ON price_history_daily FOR SELECT USING (true);

CREATE POLICY "search_cache_public_read"
  ON search_cache FOR SELECT USING (true);

-- ── Wishlists ─────────────────────────────────────────────────────────────────
-- Users can only see and modify their own wishlist rows.

CREATE POLICY "wishlists_select"
  ON wishlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "wishlists_insert"
  ON wishlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wishlists_update"
  ON wishlists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wishlists_delete"
  ON wishlists FOR DELETE
  USING (auth.uid() = user_id);

-- ── Alert log ─────────────────────────────────────────────────────────────────
-- Users can read their own alert history. Only the service role writes here.

CREATE POLICY "alerts_sent_select"
  ON alerts_sent FOR SELECT
  USING (auth.uid() = user_id);
