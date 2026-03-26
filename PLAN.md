# Kart — Implementation Plan

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

| Layer | Choice |
|---|---|
| Frontend | Next.js 14+ (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Background jobs | Supabase pg_cron + Edge Functions |
| Vendors (MVP) | CheapShark API (free, no API key, no registration required) |
| Email alerts | Resend (3,000 emails/month free) |
| AI recommendations | Groq free tier — Llama 3 8B (14,400 req/day free) |
| Source control | GitLab |
| CI/CD | GitLab CI/CD (`.gitlab-ci.yml`) |
| Hosting | Railway (free tier, $5/mo credit) |

---

## File Structure

```
kart/
├── src/
│   ├── app/                              # Next.js App Router pages (views only)
│   │   ├── layout.tsx
│   │   ├── page.tsx                      # Landing + search bar
│   │   ├── search/page.tsx               # Search results grid
│   │   ├── product/[id]/page.tsx         # Product detail, comparison, chart
│   │   ├── wishlist/page.tsx             # Auth-gated tracked items
│   │   └── auth/
│   │       ├── login/page.tsx
│   │       └── callback/route.ts         # Supabase OAuth callback
│   │
│   ├── app/api/                          # Controllers (thin: parse, validate, delegate)
│   │   ├── search/route.ts               # GET ?q=
│   │   ├── products/[id]/route.ts        # GET canonical product + vendor prices
│   │   ├── wishlist/
│   │   │   ├── route.ts                  # GET list, POST add
│   │   │   └── [id]/route.ts             # DELETE, PATCH target_price
│   │   ├── alerts/route.ts               # POST set alert, DELETE remove
│   │   ├── unsubscribe/route.ts          # GET (HMAC token verified, CAN-SPAM compliant)
│   │   └── ai/
│   │       └── recommend/route.ts        # POST → Groq recommendation
│   │
│   ├── services/                         # Business logic (no HTTP, no raw SQL)
│   │   ├── search.service.ts             # Cache check → fan-out → deduplicate → persist
│   │   ├── product.service.ts            # Assemble product page data
│   │   ├── wishlist.service.ts           # Add/remove, ownership validation
│   │   ├── alert.service.ts              # Threshold check + Resend dispatch
│   │   ├── matching.service.ts           # UPC-based deduplication across vendors
│   │   └── recommendation.service.ts     # Groq API call + rule-based fallback
│   │
│   ├── repositories/                     # Data access (Supabase queries only)
│   │   ├── product.repository.ts         # canonical_products + vendor_products
│   │   ├── price.repository.ts           # price_snapshots + price_history_daily
│   │   ├── wishlist.repository.ts        # wishlists table
│   │   └── cache.repository.ts           # search_cache table
│   │
│   ├── vendors/                          # Vendor adapter layer
│   │   ├── types.ts                      # VendorAdapter interface, VendorProduct type
│   │   ├── registry.ts                   # ONLY file that changes when adding a vendor
│   │   └── adapters/
│   │       └── cheapshark.ts
│   │
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── index.ts                  # Auth facade (AuthProvider interface)
│   │   │   └── providers/
│   │   │       └── supabase.ts           # Supabase implementation (only file touching supabase.auth)
│   │   ├── supabase/
│   │   │   ├── client.ts                 # Browser Supabase client
│   │   │   └── server.ts                 # Server client + createAdminClient()
│   │   ├── groq.ts                       # Groq client setup
│   │   ├── resend.ts                     # Resend client setup
│   │   └── middleware.ts                 # IP rate limiting logic
│   │
│   ├── schemas/                          # Zod validation (shared across controllers)
│   │   ├── search.schema.ts
│   │   ├── wishlist.schema.ts
│   │   └── alert.schema.ts
│   │
│   ├── types/
│   │   ├── database.types.ts             # Auto-generated by Supabase CLI (never edit manually)
│   │   └── api.types.ts                  # Request/response shapes
│   │
│   └── components/
│       ├── ui/                           # shadcn generated (do not edit manually)
│       ├── search-bar.tsx
│       ├── product-card.tsx
│       ├── price-history-chart.tsx       # Recharts via shadcn Chart
│       ├── vendor-comparison-table.tsx
│       └── wishlist-button.tsx
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql        # All tables + indexes
│   │   ├── 002_rls_policies.sql          # RLS as SQL (never dashboard config)
│   │   ├── 003_cron_jobs.sql             # pg_cron schedules
│   │   └── 004_daily_aggregation.sql     # Hourly → daily rollup logic
│   └── functions/
│       └── poll-prices/
│           └── index.ts                  # Self-contained Deno edge function
│
├── middleware.ts                         # Next.js middleware (rate limiting)
├── next.config.ts                        # Security headers + image remotePatterns
├── PLAN.md                               # This file
└── .env.local
```

---

## Database Schema

### `001_initial_schema.sql`
```sql
CREATE TABLE vendors (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  config  JSONB
);

CREATE TABLE canonical_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,     -- steamAppID for games, UPC for physical goods, etc.
  name        TEXT NOT NULL,
  brand       TEXT,
  category    TEXT,
  image_url   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE vendor_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id      UUID REFERENCES canonical_products ON DELETE CASCADE,
  vendor_id         TEXT REFERENCES vendors,
  vendor_product_id TEXT NOT NULL,
  product_url       TEXT,
  last_synced       TIMESTAMPTZ,
  UNIQUE(vendor_id, vendor_product_id)
);

CREATE TABLE price_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_product_id UUID REFERENCES vendor_products ON DELETE CASCADE,
  price             NUMERIC(10,2) NOT NULL,   -- cheapest price across all stores
  original_price    NUMERIC(10,2),            -- normal/non-sale price
  availability      TEXT CHECK (availability IN ('in_stock','out_of_stock','limited')),
  rating            NUMERIC(3,1),
  review_count      INT,
  store_prices      JSONB,                    -- per-store breakdown: [{storeName, price, dealUrl}]
  recorded_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_snapshots_vendor_product ON price_snapshots(vendor_product_id, recorded_at DESC);

CREATE TABLE price_history_daily (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_product_id UUID REFERENCES vendor_products ON DELETE CASCADE,
  date              DATE NOT NULL,
  price_min         NUMERIC(10,2),
  price_max         NUMERIC(10,2),
  price_avg         NUMERIC(10,2),
  UNIQUE(vendor_product_id, date)
);

CREATE TABLE search_cache (
  query_hash  TEXT PRIMARY KEY,
  results     JSONB NOT NULL,
  cached_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE wishlists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users ON DELETE CASCADE,
  canonical_id UUID REFERENCES canonical_products ON DELETE CASCADE,
  target_price NUMERIC(10,2),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, canonical_id)
);

CREATE TABLE alerts_sent (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users,
  vendor_product_id UUID REFERENCES vendor_products,
  triggered_price   NUMERIC(10,2),
  sent_at           TIMESTAMPTZ DEFAULT now()
);
```

### `002_rls_policies.sql`
```sql
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

-- Wishlists: owner full CRUD
CREATE POLICY "wishlist_select" ON wishlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wishlist_insert" ON wishlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wishlist_update" ON wishlists FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wishlist_delete" ON wishlists FOR DELETE USING (auth.uid() = user_id);
-- Alerts: read-only for owner
CREATE POLICY "alerts_select" ON alerts_sent FOR SELECT USING (auth.uid() = user_id);
-- Public catalog: anyone reads, only service role writes
CREATE POLICY "canonical_read" ON canonical_products FOR SELECT USING (true);
CREATE POLICY "vendor_products_read" ON vendor_products FOR SELECT USING (true);
CREATE POLICY "snapshots_read" ON price_snapshots FOR SELECT USING (true);
CREATE POLICY "history_read" ON price_history_daily FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE on catalog tables = only service role can write
```

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

### Phase 1 — Database
1. Install Supabase CLI, link project: `supabase link --project-ref <ref>`
2. Create migration files (001–004), push: `supabase db push`
3. Seed vendors table with CheapShark and each major store it aggregates:
   ```sql
   INSERT INTO vendors (id, name, enabled, config) VALUES
     ('cheapshark',       'CheapShark',        true, '{"rateLimit": 1}'),
     ('steam',            'Steam',              true, '{"storeId": "1"}'),
     ('greenmangaming',   'Green Man Gaming',   true, '{"storeId": "2"}'),
     ('gog',              'GOG',                true, '{"storeId": "7"}'),
     ('humble',           'Humble Store',       true, '{"storeId": "11"}'),
     ('fanatical',        'Fanatical',          true, '{"storeId": "15"}'),
     ('epicgames',        'Epic Games Store',   true, '{"storeId": "25"}');
   ```
4. Generate types: `supabase gen types typescript --project-id <ref> > src/types/database.types.ts`

**Rule:** Every schema change → new migration file → `supabase db push` → regenerate types. Never use the dashboard.

### Phase 2 — Project Scaffold
1. `npx create-next-app@latest kart --typescript --tailwind --app --src-dir`
2. Add shadcn/ui: `npx shadcn@latest add button card command table chart dialog toast badge input label`
3. Install: `npm install @supabase/supabase-js @supabase/ssr zod groq-sdk resend`
4. Create `lib/supabase/client.ts`, `lib/supabase/server.ts`
5. Create full auth facade: `lib/auth/index.ts` + `lib/auth/providers/supabase.ts`
6. Configure `next.config.ts`: security headers + image `remotePatterns`:
   - `cdn.akamai.steamstatic.com` (Steam game thumbnails via CheapShark)
   - `www.cheapshark.com` (fallback thumbnails)
7. Configure `middleware.ts`: IP rate limiting (20/min search, 30/min wishlist, 10/min alerts)
8. Add `.gitlab-ci.yml` to project root (see CI/CD Pipeline section below)
9. Add `"typecheck": "tsc --noEmit"` to `package.json` scripts (used by the lint stage)

### Phase 3 — Vendor Adapter Layer
1. Create `vendors/types.ts` — `VendorAdapter` interface, `VendorProduct` type
2. Create `vendors/adapters/cheapshark.ts` — search, getProduct, getCurrentPrice, validateProductId
3. Create `vendors/registry.ts` — register CheapShark adapter
4. Test in isolation with `scripts/test-adapter.ts` before wiring to services

**CheapShark adapter notes:**

No authentication required — all endpoints are open.

**Endpoints:**
- Search: `GET https://www.cheapshark.com/api/1.0/games?title={query}&limit=20`
- Get all store deals for a game: `GET https://www.cheapshark.com/api/1.0/deals?steamAppID={steamAppID}&pageSize=60`
- List stores (with isActive flag): `GET https://www.cheapshark.com/api/1.0/stores`

⚠️ `GET /game?id=` is blocked by Cloudflare — do not use it. Use `/deals?steamAppID=` instead.

**Search response shape (`/games`):**
```json
[{
  "gameID": "61",
  "steamAppID": "8930",
  "cheapest": "2.99",
  "cheapestDealID": "SGRhfWxOc7YoCvRw4DGIk...",
  "external": "Sid Meier's Civilization V",
  "internalName": "SIDMEIERSCIVILIZATIONV",
  "thumb": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/8930/capsule_231x87.jpg"
}]
```

**Per-store deals response shape (`/deals?steamAppID=8930`) — one object per store:**
```json
[{
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
}]
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
Four classes, each using `createServerClient()`. No business logic — queries only.

| Repository | Key methods |
|---|---|
| `product.repository.ts` | upsertCanonical, upsertVendorProducts, findById, findByExternalId |
| `price.repository.ts` | insertSnapshot, getHistory(days), getLatest |
| `wishlist.repository.ts` | findByUser, insert, delete (with userId check), getTrackedVendorProducts |
| `cache.repository.ts` | get (30-min TTL check), set, hashQuery |

All mutations include `.eq('user_id', userId)` — explicit IDOR protection layered under RLS.

### Phase 5 — Services
Business logic layer. No HTTP, no raw SQL. Calls repositories and vendor adapters.

| Service | Responsibility |
|---|---|
| `matching.service.ts` | Group VendorProducts by external_id (steamAppID), upsert canonical + vendor records |
| `search.service.ts` | Cache check → fan-out to all adapters (7s timeout) → deduplicate → persist → cache |
| `product.service.ts` | Assemble canonical + vendor prices + 90-day history for product page |
| `wishlist.service.ts` | Add/remove items, ownership validation |
| `alert.service.ts` | Check price thresholds, dispatch Resend emails, HMAC unsubscribe tokens |
| `recommendation.service.ts` | Compute rule-based signal, call Groq for natural language, fallback to rule text |

**Recommendation logic:**
- Fetch 90-day `price_history_daily`
- Compute: current vs. 90-day avg, 90-day min, 3-week trend
- Signal: "buy" (price ≥20% below avg) / "wait" (trending down) / "neutral"
- Pass signal + history summary to Groq → 2-sentence natural language response
- If Groq unavailable: return rule-based text directly

### Phase 6 — API Routes (Controllers)
Thin. Each: parse Zod schema → optional `auth.requireUser()` → one service call → return JSON.

| Route | Auth | Service |
|---|---|---|
| `GET /api/search?q=` | No | searchService.search |
| `GET /api/products/[id]` | No | productService.getProductPage |
| `GET /api/wishlist` | Yes | wishlistService.getUserWishlist |
| `POST /api/wishlist` | Yes | wishlistService.addItem |
| `DELETE /api/wishlist/[id]` | Yes | wishlistService.removeItem |
| `PATCH /api/wishlist/[id]` | Yes | wishlistService.updateTarget |
| `POST /api/ai/recommend` | Yes | recommendationService.getRecommendation |
| `GET /api/unsubscribe?userId=&token=` | No (HMAC) | alertService.verifyUnsubToken |

### Phase 7 — Edge Function + pg_cron
1. Implement `supabase/functions/poll-prices/index.ts` (Deno, self-contained):
   - Verify `Authorization: Bearer <service-role-key>` header
   - Query tracked vendor_products (those on any wishlist)
   - Process in batches of 10 with `Promise.allSettled`
   - Per product: getCurrentPrice → insert snapshot → check alert thresholds → send email if triggered
2. Deploy: `supabase functions deploy poll-prices`
3. Set secrets: `supabase secrets set RESEND_API_KEY=... GROQ_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=...`
   (No CheapShark secret needed — the API is open)
4. Register cron job (migration 003) — triggers at `0 * * * *` (hourly)
5. Register daily aggregation job (migration 004) — triggers at `5 0 * * *`
   - Rolls up hourly → daily: `INSERT INTO price_history_daily ... GROUP BY date`
   - Deletes raw snapshots older than 7 days
   - Clears expired search cache entries

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

| Concern | Mitigation |
|---|---|
| Unauthorized data access | RLS enabled on all tables from migration 002 |
| IDOR | Every mutation includes `.eq('user_id', userId)` in repository layer |
| Input injection | All API inputs validated with Zod before touching DB or vendor APIs |
| API abuse | IP-based rate limiting in middleware.ts (in-memory, upgradeable to Upstash) |
| Edge function abuse | Service role key verified in Authorization header |
| XSS via vendor data | JSX escaping by default; no dangerouslySetInnerHTML; Next.js Image for all product images |
| Secret exposure | NEXT_PUBLIC_ prefix only for anon key + Supabase URL; all other keys server-side only |
| CAN-SPAM | HMAC-signed unsubscribe token in every alert email |
| SSRF (future) | URL allowlist when accepting user-provided product URLs |

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
# Note: CheapShark requires no API key
```

---

## Known Scalability Issues & Upgrade Paths

| Issue | Current mitigation | Scale-up path |
|---|---|---|
| Edge function CPU limit (150ms) | Keep adapters lean, batch ≤50 products | Migrate to BullMQ + Upstash Redis |
| Storage growth (free: 500MB) | Daily rollup + 7-day raw snapshot retention | Upgrade Supabase or tune retention |
| CheapShark rate limit (no hard limit, be polite) | Max 1 req/sec, only poll wishlisted items | Per-vendor queues when adding paid vendors |
| Railway response timeout | 7s ceiling timeout, return partial results | Upgrade Railway plan or use background jobs |
| In-memory rate limiting resets | Acceptable for MVP | Replace with Upstash Rate Limiting |
| Supabase connection pool (60 free) | PostgREST client in edge functions | Connection pooler (PgBouncer via Supabase) |
| Auth migration | Full provider facade from day one | Swap lib/auth/providers/supabase.ts |
| DB migration | SQL migration files, never dashboard | pg_dump / psql import to any PostgreSQL |

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
