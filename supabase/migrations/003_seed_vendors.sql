-- 003_seed_vendors.sql
-- Seed the vendors table with CheapShark as the data source and each major
-- storefront it aggregates. storeId values map to CheapShark's internal store IDs
-- returned in deal responses.
--
-- When adding a new real vendor (eBay, Best Buy, etc.), insert a row here
-- and write a corresponding adapter in src/vendors/adapters/<vendor>.ts.

INSERT INTO vendors (id, name, enabled, config) VALUES
  -- CheapShark is the data provider (not a store itself)
  ('cheapshark',      'CheapShark',       true, '{"rateLimit": 1}'::jsonb),

  -- Storefronts aggregated by CheapShark (storeId matches CheapShark API)
  ('steam',           'Steam',            true, '{"storeId": "1"}'::jsonb),
  ('gamersgate',      'GamersGate',       true, '{"storeId": "2"}'::jsonb),
  ('greenmangaming',  'Green Man Gaming', true, '{"storeId": "3"}'::jsonb),
  ('gog',             'GOG',              true, '{"storeId": "7"}'::jsonb),
  ('humble',          'Humble Store',     true, '{"storeId": "11"}'::jsonb),
  ('fanatical',       'Fanatical',        true, '{"storeId": "15"}'::jsonb),
  ('epicgames',       'Epic Games Store', true, '{"storeId": "25"}'::jsonb)

ON CONFLICT (id) DO NOTHING;
