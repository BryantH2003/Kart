# Kart — Implementation Decisions

Code-level decisions: database schema performance, query optimization, tooling configuration, and implementation-specific trade-offs. These are the choices that affected how the code works internally, not what it does overall.

For system-level architectural decisions (patterns, technology choices, project structure), see [`DECISIONS-ARCHITECTURE.md`](./DECISIONS-ARCHITECTURE.md).

---

## 1. Schema Optimization: What We Missed in the Initial Design

### The Problem
The initial schema was designed for correctness — right tables, right relationships, right constraints. What it didn't account for was query patterns and the operational needs of cleanup jobs.

### Missing Foreign Key Indexes
PostgreSQL does not automatically index foreign key columns. This is a common surprise. We had several FK columns with no index:

- `vendor_products.canonical_id` — used in every product page join. Without an index, looking up all vendor listings for a product requires a full table scan of `vendor_products`.
- `wishlists.canonical_id` — used by the alert service to find all users who wishlisted a given product. Same full-scan problem.
- `alerts_sent.user_id` and `vendor_product_id` — used in the deduplication check before sending every alert. Without a composite index, this check slows proportionally with the size of the alert history.

All added in migration `004_indexes_and_optimizations.sql`.

### The price_history_daily Primary Key Problem
The original design:
```sql
CREATE TABLE price_history_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_product_id UUID ...,
  date DATE NOT NULL,
  UNIQUE(vendor_product_id, date)
);
```

This creates two indexes: one for the UUID primary key and one for the UNIQUE constraint. But the UUID primary key is never used. Nothing in the codebase queries price history by row UUID. Every query is `WHERE vendor_product_id = $1 ORDER BY date DESC`. The UUID column is pure overhead — extra storage, extra index maintenance on every insert, and a misleading signal to anyone reading the schema.

Fixed by dropping the UUID column and making `(vendor_product_id, date)` the composite primary key. One index instead of two. The PK is now the natural access key.

### Cleanup Jobs Driving Index Design
A non-obvious index requirement: the cron job that deletes old price snapshots (`DELETE WHERE recorded_at < now() - '7 days'`) cannot efficiently use the composite index `(vendor_product_id, recorded_at DESC)` because it touches all vendor_product_id values simultaneously. It needs a standalone index on `recorded_at`.

The same pattern applied to `search_cache.cached_at`. The 30-minute TTL cleanup is a full table scan without it.

**The rule that emerged:** every table with a time-based cleanup job needs a standalone index on the timestamp column used in the DELETE predicate, regardless of what other indexes exist on that column.

---

## 2. Promise-Caching for Shared Async Resources

### The Problem
The CheapShark adapter fetches the store name list from `/stores` and uses it to map store IDs to human-readable names in both `search()` and `getProduct()`. The first implementation cached the resolved `Map<string, string>` value — `null` when not yet fetched, the Map once resolved.

The race condition: if two concurrent calls to `getProduct()` arrive before the first `/stores` fetch completes, both see `null`, both fire a `/stores` request, and both await independent promises. The store list is fetched twice (or more, under high concurrency).

### The Fix
Cache the Promise, not the resolved value:

```typescript
private storeNamesPromise: Promise<Map<string, string>> | null = null

private fetchStoreNames(): Promise<Map<string, string>> {
  if (!this.storeNamesPromise) {
    this.storeNamesPromise = fetch(...)
      .then(...)
      .catch(err => {
        this.storeNamesPromise = null  // reset so retries work
        throw err
      })
  }
  return this.storeNamesPromise
}
```

All concurrent callers await the same Promise. Only one HTTP request fires regardless of concurrency. On failure, the cache resets to `null` so the next call retries rather than hanging forever on a rejected Promise.

### The Principle
When an async resource is shared across multiple callers and fetched lazily, cache the Promise — not the resolved value. Caching the value leaves a window between "cache is null" and "cache is populated" where concurrent callers all independently trigger the expensive operation.

---

## 3. Single-Pass Array Processing in the CheapShark Adapter

### The Problem
The initial `getProduct()` implementation processed the deals array in two passes:

1. A `reduce()` to find the cheapest deal (calling `parseFloat` on each price)
2. A `map()` to build the `storePrices` array (calling `parseFloat` again on each price)

For a response with 60 deals, this was 120 `parseFloat` calls and two full iterations.

### The Fix
Merge into a single `map()` that tracks the cheapest entry by index:

```typescript
let cheapestPrice = Infinity
let cheapestIdx = 0

const storePrices: VendorStorePrice[] = deals.map((d, i) => {
  const salePrice = parseFloat(d.salePrice)
  if (salePrice < cheapestPrice) { cheapestPrice = salePrice; cheapestIdx = i }
  return { storeId: d.storeID, storeName: ..., price: salePrice, ... }
})

const cheapest = storePrices[cheapestIdx]
```

One pass, 60 `parseFloat` calls, cheapest entry identified by the time the loop finishes.

### Note on Scope
At 60 items this is micro-optimization territory — the difference is not perceptible. The real value is removing the conceptual duplication: the code no longer does the same thing twice in two different ways.

---

## 4. Vitest Config Extension: .ts vs .mts

### The Problem
After installing Vitest v4 and creating `vitest.config.ts`, running `npm test` failed immediately with `ERR_REQUIRE_ESM`. The error originated inside Vitest's own dependencies (`std-env`), which are published as ESM-only. Node tried to load the config file via CommonJS `require()`, which then tried to load `std-env` via `require()`, and hit the ESM wall.

### Why This Happens
The project does not have `"type": "module"` in `package.json` (required for Next.js compatibility). Without it, Node treats `.ts` files as CommonJS when executed through the ts loader. Vite/Vitest loads its config file at startup by piping it through the TypeScript compiler and then executing the result — and in a non-ESM project, that execution path uses `require()`.

### Options Considered
**Option A: Add `"type": "module"` to package.json** — This would make all `.js`/`.ts` files in the project ESM by default. Next.js is designed to work with CommonJS at the package level; enabling module type globally causes build tool conflicts.

**Option B: Use `.mts` extension for the config file** — The `.mts` extension explicitly signals ESM regardless of the package `"type"` field. Node and the module loader treat `.mts`/`.mjs` files as ESM unconditionally.

**Option C: Use `vite.config.ts` instead** — Vitest can be configured inside `vite.config.ts`, but this project doesn't use Vite directly (it uses Next.js's bundler). Adding a `vite.config.ts` would be misleading and could interfere with Next.js's own Vite usage.

### The Decision
Rename `vitest.config.ts` → `vitest.config.mts`. The `.mts` extension is the minimal, targeted fix: it changes the module loading behavior for exactly this one file without affecting the rest of the project. All 14 tests pass after the rename.

### The Rule
In a Next.js project without `"type": "module"`, any config file for an ESM-only tool (Vitest, Playwright, etc.) should use the `.mts` or `.mjs` extension, not `.ts` or `.js`.

---

## 5. Union Types for Adapter Contracts

### The Problem
The initial adapter used raw string literals for `externalIdType` and `category` fields:

```typescript
externalIdType: 'steam_app_id',
category: 'game',
```

These strings also appear in the database schema as CHECK constraint values. If the schema changes (e.g., a new `external_id_type` is added) and the adapter is not updated, TypeScript will not catch the mismatch — the strings are just `string`.

### The Fix
Define union types in `src/vendors/types.ts` that mirror the database constraints exactly:

```typescript
export type ExternalIdType = 'steam_app_id' | 'upc' | 'gtin' | 'asin' | 'isbn'
export type ProductCategory = 'game' | 'software' | 'dlc' | 'hardware'
```

The adapter uses these types, and literal values are cast with `as const`. If a future adapter tries to use an unlisted value, TypeScript flags it at compile time rather than failing silently at runtime.

### The Trade-off
The union types in `types.ts` are a manual reflection of the database CHECK constraints. They can drift if a migration adds a new value but `types.ts` isn't updated. The mitigation is the `npm run typecheck` gate in the project rules — a type mismatch will surface before any code ships.

---

## 6. HMAC Unsubscribe Tokens with Timing-Safe Comparison

### The Problem
Every price alert email includes an unsubscribe link. The link must be unforgeable (users shouldn't be able to unsubscribe other users by guessing a URL) and must not require a database lookup to verify (the unsubscribe endpoint should be stateless).

### The Decision
Tokens are generated as `HMAC-SHA256(userId, UNSUBSCRIBE_SECRET)`. The secret never leaves the server. Verification recomputes the expected HMAC and compares with `crypto.timingSafeEqual()` rather than `===`.

The timing-safe comparison matters: a naive string comparison (`token === expected`) short-circuits on the first differing character, leaking information about how close a guess is. `timingSafeEqual` always takes the same amount of time regardless of where the strings differ, preventing timing oracle attacks.

### The Trade-off
The token is tied to the user ID, not to a specific alert or product. This means one token unsubscribes a user from all future alerts, not just one product's alerts. Per-product unsubscribe would require storing a token per alert row in the DB, adding complexity with little user benefit for an MVP. The trade-off is intentional and documented.

---

## 7. Mocking Library Clients at Module Load Time in Tests

### The Problem
`src/lib/resend.ts` calls `new Resend(process.env.RESEND_API_KEY)` at module load time. When a test file imports `alert.service.ts`, which imports `resend.ts`, the `Resend` constructor fires immediately — before any test setup runs. Without a real API key in the test environment, this throws `"Missing API key"` and the entire test file fails before a single test runs.

The same pattern applies to `groq.ts` and any other library that validates credentials on construction.

### The Fix
Mock the entire `@/lib/resend` and `@/lib/groq` modules at the top of test files using `vi.mock(...)` before the imports. Vitest hoists `vi.mock()` calls to the top of the file regardless of where they appear in source order, so the mock is in place before any module is evaluated.

```typescript
vi.mock('@/lib/resend', () => ({ resend: { emails: { send: vi.fn() } } }))
```

### The Rule
Any library that validates credentials or makes network calls in its constructor must be mocked at the module level in tests. Do not stub individual methods — replace the entire module export. This prevents constructor side effects from polluting the test environment.

---

## 8. Catalog Write Operations Use the Admin Client

### The Problem
`canonical_products`, `vendor_products`, and `price_snapshots` were given read-only RLS policies in `002_rls_policies.sql` with the comment *"only the service role writes here."* When the search service tried to persist products using the standard `createClient()` (anon key), every insert and upsert was silently blocked by RLS. The error only surfaced at runtime — `upsertCanonical` returned no error but also wrote nothing, leaving the product 404.

### Why the Admin Client Is Correct Here
The write operations happen inside server-side repository functions called from the services layer, which is only ever invoked by API route handlers that have already validated input with Zod. This matches the CLAUDE.md rule: *"Only call `createAdminClient()` in server-side code that has already verified authorization explicitly."*

Adding permissive INSERT/UPDATE policies to the catalog tables would be incorrect — those tables are not user-writable. The service role is the intended writer, and `createAdminClient()` is the mechanism for that.

### The Rule
Read operations on public catalog tables use `createClient()` (anon key, subject to RLS). Write operations on catalog tables use `createAdminClient()` (service role, bypasses RLS). This boundary is enforced in the repository layer — the service layer never needs to know which client is used.

---

## 9. Product Endpoint Accepts Both UUID and steamAppId

### The Problem
The search endpoint returns `steamAppId` (e.g. `"1145360"`) in its results, but the product endpoint `/api/products/[id]` originally only accepted canonical UUIDs. The frontend would need a separate lookup step to go from a search result to a product page, or the search result would need to include the canonical UUID before the record was persisted.

### The Decision
`product.service.getProductPage()` checks whether the `id` argument matches UUID format. If yes, it does a direct `findById` lookup. If not, it falls back to `findByExternalId(id, 'steam_app_id')`. This makes the endpoint accept both forms transparently — the controller stays thin and the service handles the ambiguity.

Additionally, the search service was updated to await `upsertCanonicalOnly()` (a fast single-table upsert) and include the returned `canonicalId` in search results. The heavier vendor + snapshot writes remain fire-and-forget. This means search results always carry a `canonicalId` that can be used directly for product page navigation.

### The Trade-off
The UUID detection regex in the service is a minor code smell — ideally the caller always knows what type of ID it has. In Phase 8 the frontend will use `canonicalId` from search results for all product links, so the steamAppId fallback becomes a convenience for direct URL access (e.g. `curl /api/products/1145360`) rather than a primary code path.

---

---

## 8. Recharts Integration: Bare HSL Values in `stroke` and `fill`

### The Problem
shadcn/ui's `ChartContainer` component wraps Recharts and injects CSS variable values as data attributes. But the `PriceHistoryChart` bypasses `ChartContainer` to avoid the additional abstraction layer — the chart is simple enough (three Area series, no tooltip portal) that the wrapper adds complexity without benefit.

The issue is that Recharts `stroke` and `fill` props accept color strings, not CSS variable references. Writing `stroke="var(--chart-1)"` works in SVG but Recharts applies it inline — browsers resolve CSS variables in stylesheets but **not** in inline SVG `stroke` attributes in all environments.

### The Decision
Inline the HSL value as a template: `stroke="hsl(var(--chart-1))"`. This works because `hsl()` is a CSS function that browsers resolve even in inline styles, unlike bare `var()` references in some SVG contexts.

The same pattern applies to CartesianGrid and axis tick colors: `stroke="hsl(var(--border))"`, `fill="hsl(var(--muted-foreground))"`. The Tooltip's `contentStyle` object uses the same pattern for background and border.

### Trade-off
The price history chart doesn't automatically respond to a future theme variable rename — the string `hsl(var(--chart-1))` is embedded in component code. This is acceptable because chart colors are stable and the alternative (hooking into `useTheme` and resolving CSS variables at runtime) is significantly more complex.

---

## 9. Wishlist Page: Server Component With Direct Service Call

### The Problem
The wishlist page is auth-gated. It needs the user's session to (a) redirect to login if unauthenticated and (b) fetch the right user's wishlist items. Two approaches:

1. **Client component** — fetch on mount, handle loading state in JS. Requires a spinner; the auth check happens client-side (visible flash before redirect).
2. **Server component with direct service call** — call `createClient()` on the server, check auth, call `getUserWishlist(userId)` directly. No HTTP round-trip, no loading state, auth redirect happens before the page renders.

### The Decision
Server component with direct service import. The wishlist page calls `supabase.auth.getUser()` on the server and either redirects immediately or passes the userId into the service. No client-side auth check is needed.

The `WishlistRow` delete action uses a native `<form method="POST">` pointing at the API route, with a hidden `_method: DELETE` field. This works without JavaScript and is idiomatic for server-rendered pages. A future enhancement could replace it with a client component for optimistic UI.

### Trade-off
The server component imports from `@/services/wishlist.service` — a direct coupling that bypasses the HTTP controller layer. This is intentional for auth-gated server renders but means the service must work correctly when called outside of an HTTP request context (it does, since services have no HTTP dependencies).

---

## 10. Cloudflare Blocks Vendor API Requests from Cloud Provider IPs Without a User-Agent

### The Problem
The CheapShark adapter worked perfectly in local development but returned HTTP 403 on every request (`/deals`, `/games`, `/stores`) when deployed to Railway. The error surfaced on the browse page as "Browse failed: Error: CheapShark /deals returned 403" and caused all search results to fail silently.

The root cause: CheapShark sits behind Cloudflare. Cloudflare's bot protection flags requests originating from cloud provider IP ranges (Railway, AWS, GCP, Vercel, etc.) as suspicious when they arrive without a `User-Agent` header. A browser making the same request would include a `User-Agent` automatically; Node.js `fetch()` does not.

### Options Considered
1. **Proxy requests through a residential IP** — effective but adds infrastructure, latency, and cost.
2. **Add a `User-Agent` header** — minimal change; Cloudflare's default bot detection uses User-Agent as a primary signal and passes requests with a recognizable browser-style UA.
3. **Switch to a different data source** — nuclear option, premature given option 2 hadn't been tried.

### The Decision
Added a `FETCH_HEADERS` constant to the CheapShark adapter with a browser-style `User-Agent` and `Accept: application/json`. Applied to all four `fetch()` calls in the adapter (`/games`, `/deals` for browse, `/deals` for getProduct, `/stores`).

```typescript
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Kart/1.0; price-tracker)',
  'Accept': 'application/json',
}
```

### The Rule
Any vendor API that uses Cloudflare or similar CDN-level bot protection requires a `User-Agent` header on server-side `fetch()` calls. Node.js's default fetch sends no `User-Agent`, which is indistinguishable from a bot to Cloudflare's default ruleset. Always set headers on vendor `fetch()` calls; the absence of headers is what triggers the 403, not the request content.

---

## 11. Cache Failures in the Search Service Must Be Non-Fatal

### The Problem
`search.service.ts` uses a 30-minute Supabase cache (`search_cache` table). The original implementation awaited both `cacheRepo.get()` and `cacheRepo.set()` without error handling. When the cache read or write failed for any reason — missing Supabase env vars, RLS policy not applied to production, transient network error — the exception propagated directly to the page, which showed "Search failed. Please try again." The user saw an error even though the upstream CheapShark API was healthy.

This meant the search feature was dependent on three things being healthy simultaneously: the CheapShark API, the Supabase connection, and the RLS policies for `search_cache`. A failure in any one of them broke search entirely.

### The Decision
Wrap both `cacheRepo.get()` and `cacheRepo.set()` in `.catch(() => null)` and `.catch(() => {})` respectively:

```typescript
const cached = await cacheRepo.get(queryHash).catch(() => null)  // miss on error
// ...
await cacheRepo.set(queryHash, items).catch(() => {/* non-fatal */})
```

A cache read failure is treated as a cache miss — the search proceeds normally, just without the latency benefit. A cache write failure is silently swallowed — the results are still returned to the user; the next identical query just won't be cached.

### The Trade-off
Cache errors are now invisible. If Supabase is persistently broken, the cache layer stops working but the symptom is slower search (every query hits CheapShark) rather than a visible error. This is the correct trade-off for a cache: it is an optimization, not a requirement. Silent degradation is better than hard failure.

If silent Supabase failures are a concern, the right tool is server-side logging (`console.error`) inside the `.catch()` handlers, not surfacing the error to the user.

*Add an entry here whenever a code-level decision is made that isn't obvious from reading the code alone — performance trade-offs, implementation quirks, non-obvious TypeScript patterns, or tooling configuration choices.*
