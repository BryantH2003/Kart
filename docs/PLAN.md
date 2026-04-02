# Kart — Implementation Plan

## Progress

| Phase                       | Status      | Notes                                                         |
| --------------------------- | ----------- | ------------------------------------------------------------- |
| 0 — External service setup  | ✅ Complete | Supabase, Resend, Groq, Railway, GitLab all configured        |
| 1 — Database                | ✅ Complete | 5 migrations applied; types generated                         |
| 2 — Project scaffold        | ✅ Complete | Next.js 16, shadcn/ui, all lib files, middleware, Zod schemas |
| 3 — Vendor adapter layer    | ✅ Complete | CheapShark adapter + registry; Vitest + MSW; 14 tests passing |
| 4 — Repositories            | ✅ Complete | 4 repositories; typecheck passes                              |
| 5 — Services                | ✅ Complete | 6 services; 35 tests passing                                  |
| 6 — API routes              | ✅ Complete | 8 routes; 55 tests passing                                    |
| 7 — Edge function + pg_cron | ⬜ Pending  |                                                               |
| 8 — Frontend                | ⬜ Pending  |                                                               |

**Resume point:** Begin Phase 7 — implement the Supabase Edge Function at `supabase/functions/poll-prices/index.ts` and register pg_cron jobs via `scripts/setup-cron-jobs.sql`.

### Testing setup (do once at the start of Phase 3)

```bash
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom msw
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

Add `vitest.config.ts` to project root:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

---

## Context

Building a deal-finder web app ("Kart") that helps users make informed purchase decisions. Users search for products, view cross-vendor price comparisons and history, add items to a wishlist, set price drop alerts, and get AI-powered buy/wait recommendations. MVP uses CheapShark as the data source — a free, no-key API that aggregates PC game prices across Steam, GOG, Green Man Gaming, Humble Store, and 15+ other storefronts. This naturally demonstrates the multi-store comparison feature that is Kart's core value. The vendor adapter architecture allows new vendors (eBay, Best Buy, etc.) to be added later by writing one adapter file.

Auth is required only for wishlist and alerts. Search and product pages are publicly accessible.

---

## Confirmed Design Decisions

- **Auth:** Email/password + Google OAuth via Supabase Auth
- **AI:** Groq free tier (Llama 3 8B) for natural language buy/wait recommendations
- **Auth facade:** Full migration-ready pattern (`lib/auth/index.ts` + `lib/auth/providers/supabase.ts`)
- **Architecture pattern:** Controller → Service → Repository
- **Job scheduling:** Supabase pg_cron + Edge Functions (migrate to BullMQ + Upstash when needed)
- **DB migration safety:** All schema changes via `supabase/migrations/`, never the dashboard

---

## Tech Stack

| Layer              | Choice                                                      |
| ------------------ | ----------------------------------------------------------- |
| Frontend           | Next.js 14+ (App Router) + TypeScript                       |
| UI                 | shadcn/ui + Tailwind CSS                                    |
| Database           | Supabase PostgreSQL                                         |
| Auth               | Supabase Auth (email/password + Google OAuth)               |
| Background jobs    | Supabase pg_cron + Edge Functions                           |
| Vendors (MVP)      | CheapShark API (free, no API key, no registration required) |
| Email alerts       | Resend (3,000 emails/month free)                            |
| AI recommendations | Groq free tier — Llama 3 8B (14,400 req/day free)           |
| Source control     | GitLab                                                      |
| CI/CD              | GitLab CI/CD (`.gitlab-ci.yml`)                             |
| Hosting            | Railway (free tier, $5/mo credit)                           |

---

## File Structure

```
kart/
├── src/
│   ├── app/                              # Next.js App Router pages (views only)
│   │   ├── globals.css
│   │   ├── layout.tsx                    # ✅ Root layout with metadata + Toaster
│   │   ├── page.tsx                      # ✅ Placeholder — full landing in Phase 8
│   │   ├── search/page.tsx               # ⬜ Phase 8
│   │   ├── product/[id]/page.tsx         # ⬜ Phase 8
│   │   ├── wishlist/page.tsx             # ⬜ Phase 8
│   │   └── auth/
│   │       ├── login/page.tsx            # ⬜ Phase 8
│   │       └── callback/route.ts         # ⬜ Phase 8
│   │
│   ├── app/api/                          # Controllers (thin: parse, validate, delegate)
│   │   ├── search/route.ts               # ⬜ Phase 6
│   │   ├── products/[id]/route.ts        # ⬜ Phase 6
│   │   ├── wishlist/route.ts             # ⬜ Phase 6
│   │   ├── wishlist/[id]/route.ts        # ⬜ Phase 6
│   │   ├── alerts/route.ts               # ⬜ Phase 6
│   │   ├── unsubscribe/route.ts          # ⬜ Phase 6
│   │   └── ai/recommend/route.ts         # ⬜ Phase 6
│   │
│   ├── services/                         # ⬜ Phase 5 — business logic
│   ├── repositories/                     # ⬜ Phase 4 — Supabase queries only
│   │
│   ├── vendors/                          # Vendor adapter layer
│   │   ├── types.ts                      # ⬜ Phase 3
│   │   ├── registry.ts                   # ⬜ Phase 3
│   │   └── adapters/
│   │       └── cheapshark.ts             # ⬜ Phase 3
│   │
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── index.ts                  # ✅ Auth facade
│   │   │   └── providers/
│   │   │       └── supabase.ts           # ✅ Only file touching supabase.auth
│   │   ├── supabase/
│   │   │   ├── client.ts                 # ✅ Browser client
│   │   │   └── server.ts                 # ✅ Server client + createAdminClient()
│   │   ├── groq.ts                       # ✅
│   │   ├── resend.ts                     # ✅
│   │   ├── utils.ts                      # ✅ shadcn cn() helper
│   │   └── middleware.ts                 # ✅ Rate limiting + session refresh
│   │
│   ├── schemas/                          # ✅ Zod schemas
│   │   ├── search.schema.ts
│   │   ├── wishlist.schema.ts
│   │   └── alert.schema.ts
│   │
│   ├── types/
│   │   ├── database.types.ts             # ✅ Auto-generated — never edit manually
│   │   └── api.types.ts                  # ✅ Request/response shapes
│   │
│   └── components/
│       ├── ui/                           # ✅ shadcn components — never edit manually
│       ├── search-bar.tsx                # ⬜ Phase 8
│       ├── product-card.tsx              # ⬜ Phase 8
│       ├── price-history-chart.tsx       # ⬜ Phase 8
│       ├── vendor-comparison-table.tsx   # ⬜ Phase 8
│       └── wishlist-button.tsx           # ⬜ Phase 8
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql        # ✅ All tables
│   │   ├── 002_rls_policies.sql          # ✅ RLS as SQL
│   │   ├── 003_seed_vendors.sql          # ✅ Vendor rows
│   │   ├── 004_indexes_and_optimizations.sql  # ✅ FK indexes, PK restructure
│   │   └── 005_vendor_extensibility.sql  # ✅ vendor_type, metadata, is_active, sync_status
│   └── functions/
│       └── poll-prices/index.ts          # ⬜ Phase 7 — Deno edge function
│
├── scripts/
│   ├── setup-cron-jobs.sql               # ✅ Cron job template (uses ${VAR} placeholders)
│   └── run-cron-setup.sh                 # ✅ Reads .env.local, substitutes, executes
│
├── middleware.ts                         # ✅ Next.js middleware entry point
├── next.config.ts                        # ✅ Security headers + image remotePatterns
├── components.json                       # ✅ shadcn config
├── .gitlab-ci.yml                        # ✅ lint+typecheck → Railway deploy pipeline
├── PLAN.md                               # This file
├── DECISIONS.md                          # Engineering decisions journal
├── CLAUDE.md                             # Project rules (auto-loaded by Claude Code)
└── .env.local                            # Never committed — see README for required vars
```

---

## Database Schema

### Current schema (after all 5 migrations)

```sql
-- vendors
CREATE TABLE vendors (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  enabled     BOOLEAN DEFAULT true,
  vendor_type TEXT NOT NULL DEFAULT 'retailer'   -- 'aggregator' | 'retailer' | 'marketplace'
              CHECK (vendor_type IN ('aggregator', 'retailer', 'marketplace')),
  config      JSONB
);

-- canonical_products
CREATE TABLE canonical_products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id      TEXT,                  -- universal ID within its type namespace
  external_id_type TEXT,                  -- 'steam_app_id' | 'upc' | 'gtin' | 'asin' | 'isbn'
  -- UNIQUE(external_id_type, external_id) WHERE both NOT NULL (partial composite index)
  name             TEXT NOT NULL,
  brand            TEXT,
  category         TEXT,
  image_url        TEXT,
  release_date     TIMESTAMPTZ,           -- games: from CheapShark releaseDate (Unix ts)
  metacritic_score INT,                   -- games: 0 = unscored
  metadata         JSONB,                 -- category-specific extras (genres, dimensions, etc.)
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- vendor_products
CREATE TABLE vendor_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id      UUID REFERENCES canonical_products ON DELETE CASCADE,
  vendor_id         TEXT REFERENCES vendors,
  vendor_product_id TEXT NOT NULL,        -- vendor's internal ID (gameID, ASIN, SKU, etc.)
  product_url       TEXT,
  last_synced       TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,     -- false = soft-deleted (listing ended)
  sync_status       TEXT NOT NULL DEFAULT 'pending'    -- 'pending'|'success'|'error'|'skipped'
                    CHECK (sync_status IN ('pending', 'success', 'error', 'skipped')),
  sync_error        TEXT,                -- last error message; null on success
  metadata          JSONB,               -- vendor-specific static data (condition, seller, etc.)
  UNIQUE(vendor_id, vendor_product_id)
);

-- price_snapshots (hourly, purged after 7 days)
CREATE TABLE price_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_product_id UUID REFERENCES vendor_products ON DELETE CASCADE,
  price             NUMERIC(10,2) NOT NULL,
  original_price    NUMERIC(10,2),
  availability      TEXT CHECK (availability IN ('in_stock','out_of_stock','limited','pre_order')),
  rating            NUMERIC(3,1),        -- normalized 0–10 scale across all vendors
  rating_text       TEXT,                -- human-readable label (e.g. "Overwhelmingly Positive")
  review_count      INT,
  store_prices      JSONB,               -- [{storeName, storeId, price, dealUrl}]
  recorded_at       TIMESTAMPTZ DEFAULT now()
);

-- price_history_daily (permanent — rolled up nightly from snapshots)
CREATE TABLE price_history_daily (
  vendor_product_id UUID REFERENCES vendor_products ON DELETE CASCADE,
  date              DATE NOT NULL,
  price_min         NUMERIC(10,2),
  price_max         NUMERIC(10,2),
  price_avg         NUMERIC(10,2),
  PRIMARY KEY (vendor_product_id, date)  -- natural composite PK, no surrogate UUID
);

-- search_cache (30-min TTL)
CREATE TABLE search_cache (
  query_hash TEXT PRIMARY KEY,
  results    JSONB NOT NULL,
  cached_at  TIMESTAMPTZ DEFAULT now()
);

-- wishlists
CREATE TABLE wishlists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users ON DELETE CASCADE,
  canonical_id UUID REFERENCES canonical_products ON DELETE CASCADE,
  target_price NUMERIC(10,2),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, canonical_id)
);

-- alerts_sent (90-day retention via cron)
CREATE TABLE alerts_sent (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users,
  vendor_product_id UUID REFERENCES vendor_products,
  triggered_price   NUMERIC(10,2),
  sent_at           TIMESTAMPTZ DEFAULT now()
);
```

**Indexes (migration 004):**

- `idx_vendor_products_canonical_id` — FK join for product page
- `idx_vendor_products_last_synced NULLS FIRST` — polling queue ordering
- `idx_price_snapshots_recorded_at` — nightly 7-day cleanup DELETE
- `idx_search_cache_cached_at` — 30-min TTL cleanup DELETE
- `idx_wishlists_canonical_id` — alert service "who wishlisted this product?"
- `idx_alerts_sent_dedup (user_id, vendor_product_id, sent_at DESC)` — deduplication check
- `idx_vendor_products_poll_queue (last_synced) WHERE is_active = true` — active product polling

---

## Architecture: Controller → Service → Repository

```
HTTP Request
      │
      ▼
  Controller (app/api/route.ts)
  – Parse + validate input with Zod
  – Call auth.requireUser() if protected
  – Call one service method
  – Return HTTP response
      │
      ▼
  Service (services/*.service.ts)
  – Business logic lives here
  – Orchestrates repositories + vendor adapters
  – No HTTP concerns, no raw SQL
      │
      ▼
  Repository (repositories/*.repository.ts)
  – Raw Supabase queries only
  – Returns typed data
  – No business logic
      │
      ▼
  Supabase PostgreSQL
```

### Auth Facade (migration-safe)

Only `lib/auth/providers/supabase.ts` ever calls `supabase.auth`. All other code imports from `lib/auth/index.ts`. To swap auth providers (e.g., to Clerk), write a new provider file and update the one import in `index.ts`.

### Vendor Adapter Pattern (infinitely scalable)

Adding a new vendor requires exactly 3 steps:

1. Write `vendors/adapters/<vendor>.ts` implementing `VendorAdapter`
2. Add one line to `vendors/registry.ts`
3. Insert one row into the `vendors` DB table

Zero changes to services, repositories, API routes, or the frontend.

---

## Build Phases

### Phase 0 — External Service Setup

1. **Supabase** — Create project, enable `pg_cron` and `pg_net` extensions
2. **CheapShark** — No registration, no API key. Base URL: `https://www.cheapshark.com/api/1.0`. Nothing to do here.
3. **Resend** — Create account, verify sending domain
4. **Groq** — Create account at console.groq.com (free: 14,400 req/day)
5. **Railway** — Create account at railway.app, create a new project + service, set all app env vars in the Railway dashboard. Generate an API token under Account Settings → Tokens.
   **GitLab** — Push repo to GitLab. Under Settings → CI/CD → Variables, add `RAILWAY_TOKEN` (masked + protected). All other app secrets live in Railway, not GitLab.
6. **Google OAuth** — Supabase dashboard → Authentication → Providers → Google
7. Populate `.env.local` (see Environment Variables section)

### Phase 1 — Database ✅

1. Install Supabase CLI, link project: `supabase link --project-ref <ref>`
2. Apply all 5 migrations: `supabase db push`
3. Generate types: `supabase gen types typescript --project-id <ref> > src/types/database.types.ts`

**Migration files:**
| File | Contents |
|---|---|
| `001_initial_schema.sql` | All tables + indexes |
| `002_rls_policies.sql` | RLS policies for all tables |
| `003_seed_vendors.sql` | CheapShark + 7 storefronts seeded into vendors table |
| `004_indexes_and_optimizations.sql` | Missing FK indexes, price_history_daily PK restructure, cleanup indexes |
| `005_vendor_extensibility.sql` | vendor_type, external_id_type, metadata JSONB, is_active, sync_status, pre_order availability |

**Rule:** Every schema change → new migration file → `supabase db push` → regenerate types. Never use the dashboard.

### Phase 2 — Project Scaffold ✅

**What was built:**

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- shadcn/ui initialized via `components.json`; components added: `button`, `card`, `command`, `table`, `dialog`, `sonner`, `badge`, `input`, `label`, `chart`
- Dependencies installed: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `groq-sdk`, `resend`, `class-variance-authority`, `clsx`, `tailwind-merge`
- `src/lib/supabase/client.ts` — browser Supabase client
- `src/lib/supabase/server.ts` — server client + `createAdminClient()`
- `src/lib/auth/index.ts` + `src/lib/auth/providers/supabase.ts` — auth facade
- `src/lib/groq.ts`, `src/lib/resend.ts`, `src/lib/utils.ts`
- `src/lib/middleware.ts` — IP rate limiting + session refresh logic
- `src/schemas/` — Zod schemas: `search.schema.ts`, `wishlist.schema.ts`, `alert.schema.ts`
- `src/types/api.types.ts` — request/response type shapes
- `next.config.ts` — security headers + Steam/CheapShark image remotePatterns
- `middleware.ts` — Next.js middleware entry point (delegates to `src/lib/middleware.ts`)
- `package.json` — `typecheck` script added
- `CLAUDE.md` — project rules file (auto-loaded by Claude Code)
- `DECISIONS.md` — engineering decisions journal
- `.gitignore` — updated for Supabase local state, Railway, and Claude Code files

**Note:** `create-next-app` was scaffolded to a temp directory and copied in due to the project directory name "Kart" containing a capital letter (npm naming restriction). Scaffolding directly with `.` fails.

### Phase 3 — Vendor Adapter Layer

1. Install Vitest + MSW (see testing setup above)
2. Create `vendors/types.ts` — `VendorAdapter` interface, `VendorProduct` type
3. Create `vendors/adapters/cheapshark.ts` — search, getProduct, getCurrentPrice, validateProductId
4. Create `vendors/registry.ts` — register CheapShark adapter
5. Write `vendors/adapters/cheapshark.test.ts` — unit tests for normalization logic using MSW

**Tests to write (Phase 3):**
| Test | What it verifies |
|---|---|
| `search() normalizes games response` | Raw `/games` JSON → correct `VendorProduct[]` shape; numeric fields parsed; thumb mapped |
| `search() filters out games with no steamAppID` | Games missing steamAppID are excluded from results |
| `getCurrentPrice() picks lowest salePrice` | Multi-store response → `price` = min salePrice across active stores |
| `getCurrentPrice() builds store_prices array` | Each active-store deal appears as `{storeName, storeId, price, dealUrl}` |
| `getCurrentPrice() converts releaseDate` | Unix timestamp → ISO date string |
| `getCurrentPrice() normalizes steamRatingPercent` | "95" → 9.5 (÷10 as number) |
| `validateProductId() accepts numeric strings` | "123" → true; "abc" / "" / "1.5" → false |
| `search() returns empty array on network error` | MSW returns 500 → adapter returns `[]`, does not throw |

**CheapShark adapter notes:**

No authentication required — all endpoints are open.

**Endpoints:**

- Search: `GET https://www.cheapshark.com/api/1.0/games?title={query}&limit=20`
- Get all store deals for a game: `GET https://www.cheapshark.com/api/1.0/deals?steamAppID={steamAppID}&pageSize=60`
- List stores (with isActive flag): `GET https://www.cheapshark.com/api/1.0/stores`

⚠️ `GET /game?id=` is blocked by Cloudflare — do not use it. Use `/deals?steamAppID=` instead.

**Search response shape (`/games`):**

```json
[
  {
    "gameID": "61",
    "steamAppID": "8930",
    "cheapest": "2.99",
    "cheapestDealID": "SGRhfWxOc7YoCvRw4DGIk...",
    "external": "Sid Meier's Civilization V",
    "internalName": "SIDMEIERSCIVILIZATIONV",
    "thumb": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/8930/capsule_231x87.jpg"
  }
]
```

**Per-store deals response shape (`/deals?steamAppID=8930`) — one object per store:**

```json
[
  {
    "title": "Sid Meier's Civilization V",
    "dealID": "SGRhfWxO...",
    "storeID": "1",
    "gameID": "61",
    "salePrice": "2.99",
    "normalPrice": "29.99",
    "isOnSale": "1",
    "metacriticScore": "90",
    "steamRatingText": "Overwhelmingly Positive",
    "steamRatingPercent": "95",
    "steamRatingCount": "77866",
    "steamAppID": "8930",
    "releaseDate": 1285027200,
    "thumb": "https://shared.fastly.steamstatic.com/..."
  }
]
```

**Field normalization:**

- `gameID` → `vendorProductId`
- `steamAppID` → `external_id` (canonical matching key — stable across APIs)
- `title` → `name` (use from deals response — more reliable than `external` from search)
- `thumb` → `imageUrl`
- cheapest `salePrice` across all deals → `price`
- `normalPrice` from cheapest deal → `originalPrice`
- `releaseDate` (Unix timestamp) → `release_date` (convert: `new Date(releaseDate * 1000)`)
- `metacriticScore` (string "90") → `metacritic_score` (parseInt)
- `steamRatingPercent` / 10 → `rating` (e.g., "95" → 9.5 on 0–10 scale)
- `steamRatingCount` → `review_count`
- `steamRatingText` → `rating_text` (e.g., "Overwhelmingly Positive")
- `availability` → always `'in_stock'` (CheapShark only lists active deals)
- `productUrl` → `https://www.cheapshark.com/redirect?dealID={cheapestDealID}`
- all deals → `store_prices` JSONB: `[{ storeName, storeId, price, dealUrl }]`
  Only include deals where the store's `isActive === 1` (fetch store list once and cache it)

**`validateProductId`:** `/^\d+$/.test(id)` — CheapShark game IDs are numeric strings.

**Store prices for the comparison table:**
`getCurrentPrice(gameID)` calls `/deals?steamAppID={steamAppID}&pageSize=60` and returns:

- `price` = minimum `salePrice` across all active-store deals
- `store_prices` JSONB = `[{ storeName, storeId, price, dealUrl }]` for every active-store deal

The service layer persists `storePrices` into the `store_prices` column of `price_snapshots`. The frontend reads this column to render the per-store comparison table.

### Phase 4 — Repositories

Four files, each using `createServerClient()`. No business logic — queries only.

| Repository               | Key methods                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `product.repository.ts`  | upsertCanonical, upsertVendorProducts, findById, findByExternalId        |
| `price.repository.ts`    | insertSnapshot, getHistory(days), getLatest                              |
| `wishlist.repository.ts` | findByUser, insert, delete (with userId check), getTrackedVendorProducts |
| `cache.repository.ts`    | get (30-min TTL check), set, hashQuery                                   |

All mutations include `.eq('user_id', userId)` — explicit IDOR protection layered under RLS.

**Tests to write (Phase 4):** None — repositories are thin Supabase query wrappers with no branching logic. They are covered by service-layer tests that mock them, and by the live DB when run end-to-end. Do not write unit tests for queries.

### Phase 5 — Services

Business logic layer. No HTTP, no raw SQL. Calls repositories and vendor adapters.

| Service                     | Responsibility                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `matching.service.ts`       | Group VendorProducts by external_id (steamAppID), upsert canonical + vendor records |
| `search.service.ts`         | Cache check → fan-out to all adapters (7s timeout) → deduplicate → persist → cache  |
| `product.service.ts`        | Assemble canonical + vendor prices + 90-day history for product page                |
| `wishlist.service.ts`       | Add/remove items, ownership validation                                              |
| `alert.service.ts`          | Check price thresholds, dispatch Resend emails, HMAC unsubscribe tokens             |
| `recommendation.service.ts` | Compute rule-based signal, call Groq for natural language, fallback to rule text    |

**Recommendation logic:**

- Fetch 90-day `price_history_daily`
- Compute: current vs. 90-day avg, 90-day min, 3-week trend
- Signal: "buy" (price ≥20% below avg) / "wait" (trending down) / "neutral"
- Pass signal + history summary to Groq → 2-sentence natural language response
- If Groq unavailable: return rule-based text directly

**Tests to write (Phase 5):** Mock all repositories and adapters with `vi.fn()`. Test the service's decision logic, not the mocks.

| Test file                        | Key cases                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search.service.test.ts`         | Cache hit returns cached result without calling adapter; cache miss calls adapter + persists + caches; adapter timeout (7s) does not crash search                                 |
| `alert.service.test.ts`          | Price above threshold → no email; price at/below threshold → Resend called; duplicate alert within cooldown → not re-sent; HMAC token verifies correctly; tampered token rejected |
| `recommendation.service.test.ts` | Price ≥20% below 90d avg → "buy" signal; downward 3-week trend → "wait" signal; Groq unavailable → falls back to rule text without throwing                                       |
| `wishlist.service.test.ts`       | Duplicate add rejected; remove with wrong userId rejected (ownership check)                                                                                                       |

### Phase 6 — API Routes (Controllers)

Thin. Each: parse Zod schema → optional `auth.requireUser()` → one service call → return JSON.

**Tests to write (Phase 6):** Controllers have no logic — Zod + TypeScript coverage is sufficient. Write tests for the Zod schemas themselves instead.

| Test file                 | Key cases                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `search.schema.test.ts`   | Empty string rejected; query over 100 chars rejected; valid short query passes                         |
| `wishlist.schema.test.ts` | Missing canonical_id rejected; negative target_price rejected; null target_price (remove alert) passes |
| `alert.schema.test.ts`    | Invalid HMAC token format rejected; valid token shape passes                                           |

| Route                                 | Auth      | Service                                 |
| ------------------------------------- | --------- | --------------------------------------- |
| `GET /api/search?q=`                  | No        | searchService.search                    |
| `GET /api/products/[id]`              | No        | productService.getProductPage           |
| `GET /api/wishlist`                   | Yes       | wishlistService.getUserWishlist         |
| `POST /api/wishlist`                  | Yes       | wishlistService.addItem                 |
| `DELETE /api/wishlist/[id]`           | Yes       | wishlistService.removeItem              |
| `PATCH /api/wishlist/[id]`            | Yes       | wishlistService.updateTarget            |
| `POST /api/ai/recommend`              | Yes       | recommendationService.getRecommendation |
| `GET /api/unsubscribe?userId=&token=` | No (HMAC) | alertService.verifyUnsubToken           |

### Phase 7 — Edge Function + pg_cron

1. Implement `supabase/functions/poll-prices/index.ts` (Deno, self-contained):
   - Verify `Authorization: Bearer <CRON_SECRET>` header (NOT the service role key)
   - Query tracked vendor_products (those on any wishlist)
   - Process in batches of 10 with `Promise.allSettled`
   - Per product: getCurrentPrice → insert snapshot → check alert thresholds → send email if triggered
2. Deploy: `supabase functions deploy poll-prices`
3. Generate and set the cron secret:
   ```
   openssl rand -hex 32   # copy output
   supabase secrets set CRON_SECRET=<output>
   ```
   Also add `CRON_SECRET=<output>` to `.env.local`.
4. Set remaining function secrets:
   ```
   supabase secrets set RESEND_API_KEY=... GROQ_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
   ```
   (No CheapShark secret needed — the API is open)
5. Register cron jobs — run `scripts/setup-cron-jobs.sql` manually:
   - Replace `<PROJECT_REF>` with your Supabase project reference ID
   - Replace `<CRON_SECRET>` with the value you generated in step 3
   - Run via: `supabase db execute --file scripts/setup-cron-jobs.sql`
   - Job 1 (`poll-prices-hourly`): triggers at `0 * * * *` (hourly)
   - Job 2 (`aggregate-daily-prices`): triggers at `5 0 * * *`
     - Rolls up hourly → daily: `INSERT INTO price_history_daily ... GROUP BY date`
     - Deletes raw snapshots older than 7 days
     - Clears expired search cache entries

   **Why not a migration?** Cron jobs reference secrets (`CRON_SECRET`) that can't be committed
   to a public repo. `scripts/setup-cron-jobs.sql` uses placeholders and is a one-time manual step.

### Phase 8 — Frontend

Build pages in order (each depends on the previous):

1. **Landing** (`app/page.tsx`) — SearchBar (shadcn Command) + "How it works"
2. **Search results** (`app/search/page.tsx`) — ProductCard grid, filter sidebar
3. **Product detail** (`app/product/[id]/page.tsx`):
   - VendorComparisonTable — maps over `product.vendors[]`, best price highlighted
   - PriceHistoryChart — shadcn Chart, 90-day daily price line
   - WishlistButton — client component, POST /api/wishlist
   - AI recommendation panel — calls POST /api/ai/recommend, shows loading skeleton
4. **Wishlist** (`app/wishlist/page.tsx`) — auth-gated, current vs. target price, delete
5. **Auth** (`app/auth/login/page.tsx`) — Supabase Auth UI, Google OAuth button, email/password

---

## Security

| Concern                  | Mitigation                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Unauthorized data access | RLS enabled on all tables from migration 002                                              |
| IDOR                     | Every mutation includes `.eq('user_id', userId)` in repository layer                      |
| Input injection          | All API inputs validated with Zod before touching DB or vendor APIs                       |
| API abuse                | IP-based rate limiting in middleware.ts (in-memory, upgradeable to Upstash)               |
| Edge function abuse      | CRON_SECRET verified in Authorization header (not the service role key)                   |
| XSS via vendor data      | JSX escaping by default; no dangerouslySetInnerHTML; Next.js Image for all product images |
| Secret exposure          | NEXT*PUBLIC* prefix only for anon key + Supabase URL; all other keys server-side only     |
| CAN-SPAM                 | HMAC-signed unsubscribe token in every alert email                                        |
| SSRF (future)            | URL allowlist when accepting user-provided product URLs                                   |

---

## Environment Variables

```
# .env.local
NEXT_PUBLIC_SUPABASE_URL=         # browser-safe
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # browser-safe (RLS is the protection layer)
SUPABASE_SERVICE_ROLE_KEY=        # server + edge function only — bypasses RLS
RESEND_API_KEY=                   # server only
RESEND_FROM_EMAIL=                # e.g. alerts@yourdomain.com or onboarding@resend.dev
UNSUBSCRIBE_SECRET=               # random 32+ char string (openssl rand -hex 32)
GROQ_API_KEY=                     # server only
CRON_SECRET=                      # random 32+ char string — verified by poll-prices Edge Function
                                  # also set via: supabase secrets set CRON_SECRET=<value>
# Note: CheapShark requires no API key
```

---

## Known Scalability Issues & Upgrade Paths

| Issue                                            | Current mitigation                          | Scale-up path                               |
| ------------------------------------------------ | ------------------------------------------- | ------------------------------------------- |
| Edge function CPU limit (150ms)                  | Keep adapters lean, batch ≤50 products      | Migrate to BullMQ + Upstash Redis           |
| Storage growth (free: 500MB)                     | Daily rollup + 7-day raw snapshot retention | Upgrade Supabase or tune retention          |
| CheapShark rate limit (no hard limit, be polite) | Max 1 req/sec, only poll wishlisted items   | Per-vendor queues when adding paid vendors  |
| Railway response timeout                         | 7s ceiling timeout, return partial results  | Upgrade Railway plan or use background jobs |
| In-memory rate limiting resets                   | Acceptable for MVP                          | Replace with Upstash Rate Limiting          |
| Supabase connection pool (60 free)               | PostgREST client in edge functions          | Connection pooler (PgBouncer via Supabase)  |
| Auth migration                                   | Full provider facade from day one           | Swap lib/auth/providers/supabase.ts         |
| DB migration                                     | SQL migration files, never dashboard        | pg_dump / psql import to any PostgreSQL     |

---

## Future Vendor Onboarding

1. Write `src/vendors/adapters/<vendor>.ts` implementing `VendorAdapter`
2. Add one line to `src/vendors/registry.ts`
3. `INSERT INTO vendors VALUES ('<id>', '<name>', true, '{"rateLimit": N}');`

No other changes required.

---

## CI/CD Pipeline (`.gitlab-ci.yml`)

```yaml
stages:
  - test
  - deploy

variables:
  NODE_VERSION: "20"

# Runs on every merge request and push to main
# Catches type errors and lint issues before they reach production
lint-and-typecheck:
  stage: test
  image: node:${NODE_VERSION}-alpine
  cache:
    key: ${CI_COMMIT_REF_SLUG}
    paths:
      - node_modules/
  script:
    - npm ci
    - npm run lint
    - npm run typecheck
  only:
    - merge_requests
    - main

# Runs only on pushes to main — deploys to Railway
deploy-production:
  stage: deploy
  image: node:${NODE_VERSION}-alpine
  script:
    - npm install -g @railway/cli
    - railway up --service kart --detach
  environment:
    name: production
    url: https://your-app.railway.app
  only:
    - main
```

**Environment variable rules:**

- `RAILWAY_TOKEN` — set in GitLab CI/CD Variables (masked + protected). Used by the pipeline to authenticate Railway deploys.
- All app secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, etc.) — set in Railway dashboard under the service's Variables tab. Railway injects them at runtime. They never touch GitLab.
- CheapShark requires no credentials — no env var needed.

---

## CheapShark API Notes

No authentication. No rate limit documented, but be a good citizen: cap at 1 request/second in the polling job. All requests are plain `fetch()` GET calls.

**Store ID reference** (used to map `storeID` in deal responses to human-readable store names):
| storeID | Name |
|---|---|
| 1 | Steam |
| 2 | GamersGate |
| 3 | Green Man Gaming |
| 7 | GOG |
| 8 | Origin / EA App |
| 11 | Humble Store |
| 13 | Ubisoft Connect |
| 15 | Fanatical |
| 25 | Epic Games Store |
| 27 | Games Planet |

Fetch the full list at runtime with `GET /stores` and cache it — the store list rarely changes.
