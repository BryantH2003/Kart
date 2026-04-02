-- 006_search_cache_rls.sql
-- Add write policies for search_cache.
--
-- search_cache stores public search results (no PII, no user data).
-- The Next.js server writes to it using the anon key from public API routes
-- (e.g. GET /api/search), which have no authenticated session.
-- RLS was blocking these writes because only a SELECT policy existed.
--
-- Allows: anon INSERT and UPDATE (upsert on conflict).
-- Does not expose any user data — the table only contains query hashes + JSON results.

CREATE POLICY "search_cache_anon_insert"
  ON search_cache FOR INSERT
  WITH CHECK (true);

CREATE POLICY "search_cache_anon_update"
  ON search_cache FOR UPDATE
  USING (true)
  WITH CHECK (true);
