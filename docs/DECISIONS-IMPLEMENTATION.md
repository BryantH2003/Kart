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

*Add an entry here whenever a code-level decision is made that isn't obvious from reading the code alone — performance trade-offs, implementation quirks, non-obvious TypeScript patterns, or tooling configuration choices.*
