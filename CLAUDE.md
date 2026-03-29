# Kart — Project Rules

These rules apply to every prompt, every file, and every phase of this project.
Read them before making any change.

## Maintaining DECISIONS.md

`DECISIONS.md` is an engineering journal that tells the story of technical problems encountered and how they were solved. It is read by the project owner when preparing for interviews and by any collaborator trying to understand why the codebase looks the way it does.

**Update DECISIONS.md whenever any of the following happens:**
- A non-obvious architectural decision is made (e.g. choosing pattern A over pattern B)
- A design problem is discovered and resolved (e.g. a missing index, a schema assumption that breaks under a new vendor)
- A constraint or external service causes a pivot (e.g. an API being inaccessible, a tool not supporting a required feature)
- A rule is added to this file that required a real incident or problem to justify

**How to write an entry:**
1. Give it a short numbered title that names the problem, not the solution
2. Open with the problem in plain language — what broke or what risk was identified
3. Describe what options were on the table and why the rejected ones were ruled out
4. State the decision and the trade-offs accepted
5. Close with the general principle or rule that came out of it, if one exists

Do not log routine implementation work (adding a component, writing a query). Only log decisions where the reasoning is non-obvious or where future readers might wonder "why did they do it this way?"

---

## Architecture

### Controller → Service → Repository — never skip layers
- **Controllers** (`src/app/api/**/route.ts`): parse input with Zod, call `auth.requireUser()` if protected, call exactly one service method, return HTTP response. No business logic. No raw SQL.
- **Services** (`src/services/*.service.ts`): business logic only. Orchestrate repositories and vendor adapters. No `NextRequest`/`NextResponse`. No raw Supabase queries.
- **Repositories** (`src/repositories/*.repository.ts`): Supabase queries only. Return typed data. No business logic. No HTTP concerns.

### Auth facade — never call `supabase.auth` directly
All auth code imports from `@/lib/auth`. Only `src/lib/auth/providers/supabase.ts` is allowed to call `supabase.auth.*`. This makes swapping auth providers a one-file change.

### Vendor adapter pattern — never call vendor APIs from services directly
All vendor API calls go through a `VendorAdapter` implementation in `src/vendors/adapters/`. Services call the adapter interface. Adding a new vendor = one adapter file + one registry line + one DB row.

---

## Database Schema Optimization

When creating or modifying any table, proactively evaluate all of the following before finalizing the migration. Do not wait to be asked.

### PostgreSQL never auto-indexes foreign key columns
Every FK column (`REFERENCES ...`) needs an explicit `CREATE INDEX` unless the table has fewer than a few hundred rows ever. Missing FK indexes cause full table scans on joins. Check every FK when writing a migration.

### Identify the real access pattern before choosing a primary key
If a table's natural key (e.g., `(vendor_product_id, date)`) covers 100% of queries, use it as the PK directly. A UUID surrogate PK that is never queried by external code just adds a second index with no benefit. Use UUID PKs where the ID is exposed externally (API responses, URL params) or where there is no natural key.

### Append-only tables need a standalone timestamp index for cleanup jobs
Any table with a `recorded_at` / `cached_at` / `sent_at` / `created_at` column that has a planned DELETE-by-age job needs a standalone index on that timestamp column. A composite index with another leading column cannot efficiently serve a bulk delete across all rows older than a threshold.

### Every table with unbounded growth needs a retention policy
Before finalizing a migration, ask: does this table grow forever? If yes, define a retention window and add a cleanup job to `scripts/setup-cron-jobs.sql`. Current retention policies:
- `price_snapshots` — 7 days (raw hourly data rolled up nightly)
- `search_cache` — 30 minutes (TTL)
- `alerts_sent` — 90 days

### Suggest a composite index for any multi-column WHERE clause on a hot path
If a service or repository will query `WHERE col_a = $1 AND col_b = $2 ORDER BY col_c DESC`, that needs a composite index `(col_a, col_b, col_c DESC)`. Columns in equality predicates go first, range/sort columns go last.

### Partial indexes for known-filtered queries
If a query always filters on a low-cardinality boolean (e.g., `WHERE enabled = true`, `WHERE availability = 'in_stock'`), a partial index reduces index size and speeds up scans.

### Note scale assumptions in migration comments
Comment why each index exists and what query it serves. If an index is deferred because the table is small, note the threshold at which it should be added.

---

## Database
Never use the Supabase dashboard to change schema. Every change gets a new file in `supabase/migrations/` with the next sequential number. After pushing: regenerate types with `supabase gen types typescript --project-id <ref> > src/types/database.types.ts`.

### Never edit `src/types/database.types.ts` manually
It is auto-generated. Any manual edit will be overwritten next time types are regenerated.

### RLS on every table — as SQL, never via dashboard
All Row Level Security policies live in `supabase/migrations/002_rls_policies.sql` (or a new migration). Never configure RLS through the dashboard.

### Every mutation includes an explicit user_id check
All repository mutations include `.eq('user_id', userId)` in addition to RLS. Defense in depth against IDOR bugs.

### Cron job setup is manual — never a migration
`scripts/setup-cron-jobs.sql` references secrets that can't be committed. Run it via `scripts/run-cron-setup.sh`, which reads `.env.local` and substitutes values at runtime. Never put cron jobs or secrets in migration files.

---

## Security

### Never put secrets in migration files or committed SQL
Secrets belong in `.env.local` only. Scripts that need secrets use `envsubst` to substitute at runtime.

### NEXT_PUBLIC_ prefix only for anon key and Supabase URL
All other env vars are server-side only. Never prefix a secret with `NEXT_PUBLIC_`.

### `createAdminClient()` bypasses RLS — use sparingly
Only call `createAdminClient()` in server-side code that has already verified authorization explicitly. Never use it in API routes that handle user input without prior validation.

### All API inputs validated with Zod before touching DB or vendor APIs
Schemas live in `src/schemas/`. Controllers must parse with a schema before doing anything else.

### No `dangerouslySetInnerHTML` — ever
Use JSX and Next.js `<Image>` for all content rendering. Vendor data is untrusted.

### Rate limiting on all `/api/` routes
Limits are defined in `src/lib/middleware.ts`. When adding a new route, check if it needs a rate limit entry.

---

## TypeScript

### `npm run typecheck` must pass before considering anything done
Run `tsc --noEmit` after every meaningful change. A clean typecheck is the baseline, not a bonus.

### No `any` — use proper types or `unknown`
If a type is genuinely unknown, use `unknown` and narrow it. `any` disables the type system for that code path.

### Zod schemas own the shape of external data
API responses from CheapShark (and any future vendor) must be parsed through a Zod schema before use. Never trust raw `JSON.parse()` output.

---

## Code Style

### Keep it simple — no premature abstractions
Don't build utilities or helpers for one-time use. Three lines of similar code is better than a premature abstraction. Build for the current requirement, not a hypothetical future one.

### No defensive error handling for impossible cases
Only validate at system boundaries (user input, external APIs). Don't add fallbacks for internal invariants that can't fail.

### No comments on self-evident code
Only comment where the logic isn't obvious — e.g., explaining a non-obvious API quirk or a deliberate trade-off.

---

## Next.js / Project Conventions

### Root-level config files stay at root
`package.json`, `next.config.ts`, `tsconfig.json`, `proxy.ts`, `components.json`, `postcss.config.mjs` must remain at the project root. Next.js requires this.

### Next.js 16+: `proxy.ts` replaces `middleware.ts`
This project runs Next.js 16+. The proxy entry point is `proxy.ts` (root), which exports `proxy()` and `proxyConfig` instead of the v14-15 `middleware()` and `config`. The internal session/rate-limit logic stays in `src/lib/middleware.ts` unchanged. Never create a `middleware.ts` at the root — it will be ignored.

### Route handlers use `Response.json()`, not `NextResponse.json()`
Next.js route handlers are standard Web API handlers. Use the native `Response.json(data, { status })` rather than importing `NextResponse`. Only import `NextRequest`/`NextResponse` when you need Next.js-specific features (rewrites, redirects at the edge).

### All documentation lives in `docs/`
`docs/PLAN.md`, `docs/DECISIONS.md`, and any future reference or how-to documents live in the `docs/` folder. `README.md` and `CLAUDE.md` stay at the root (git and Claude Code conventions). Update `docs/DECISIONS.md` per the rules above whenever a non-obvious decision is made.

### shadcn/ui components are never edited manually
Files in `src/components/ui/` are generated by `npx shadcn@latest add`. If a component needs customization, wrap it — don't edit the source file.

### `.env.local` is the single source of truth for secrets
No `.env.example`. Secrets are documented in `docs/PLAN.md` under Environment Variables. The file itself is gitignored.

### `supabase/.temp/` and `supabase/.branches/` are gitignored
These contain local CLI state. Never commit them.

---

## Vendor Extensibility

These rules exist so adding a new vendor never requires schema changes.

### vendor_type drives adapter behavior — never branch on vendor ID
When adapter or service logic needs to behave differently for an aggregator vs. a retailer vs. a marketplace, read `vendor_type` from the `vendors` table. Never write `if vendorId === 'cheapshark'` in application code.

### Every new product category uses external_id_type to namespace its identifier
`canonical_products.external_id` is only unique within its type. A Steam App ID "8930" and a UPC "000008930..." are different things. Always set `external_id_type` when creating a canonical product. Known types: `steam_app_id`, `upc`, `gtin`, `asin`, `isbn`.

### Vendor-specific product data goes in vendor_products.metadata JSONB — not new columns
If a vendor returns extra product fields (eBay seller condition, Amazon model number, Steam genres), store them in `vendor_products.metadata`. Do not add new columns to `vendor_products` for vendor-specific data. New columns are only justified if the field is universal across all vendors.

### Same rule applies to canonical_products.metadata for category-specific fields
Fields that only make sense for one product category (e.g. `release_date`, `metacritic_score` for games) can go in `metadata` when introduced. Columns in the main table are for fields present across all product categories.

### Soft-delete vendor_products with is_active = false — never DELETE
When a listing ends (eBay sold, SKU discontinued, game delisted), set `is_active = false`. Do not delete the row. Price history (`price_snapshots`, `price_history_daily`) must be preserved for the history chart to remain accurate. The polling job skips `is_active = false` rows automatically.

### Always update sync_status and sync_error after each poll attempt
On success: `sync_status = 'success', sync_error = null`. On failure: `sync_status = 'error', sync_error = <message>`. This is the only observability signal for diagnosing stale data or failing vendor APIs.

### The availability CHECK constraint covers: in_stock, out_of_stock, limited, pre_order
Adapters normalize vendor-specific availability strings to these four values. If a new state genuinely doesn't fit, extend the CHECK constraint in a new migration — do not stuff unrecognized values into an existing value.

### store_prices JSONB works for all vendor types
For aggregators (CheapShark): an array of per-store prices. For single-store retailers (Steam, Best Buy): a single-item array. For marketplaces (eBay): one entry per seller listing. The frontend renders whatever is in the array. Adapters are responsible for populating it correctly.

---

## Testing

### Test runner: Vitest — not Jest
This project uses **Vitest** as the test runner. It has the same API as Jest but is significantly faster, has native ESM/TypeScript support without extra config, and integrates naturally with the Vite ecosystem. Never install or configure Jest.

Setup: `npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom msw`

### What to unit test
| Layer | Test what | Test file location |
|---|---|---|
| Vendor adapters | Normalization logic: given raw API response → assert correct normalized output | Next to the adapter: `cheapshark.test.ts` |
| Services | Business logic: cache hit/miss, alert threshold check, dedup logic | Next to the service: `search.service.test.ts` |
| Zod schemas | Valid inputs pass, invalid inputs fail with correct error paths | Next to the schema: `search.schema.test.ts` |

### What NOT to unit test
- **Repositories** — they are thin Supabase query wrappers. Mock at the service boundary instead.
- **Controllers (API routes)** — they have no logic; they parse + delegate. TypeScript + Zod coverage is sufficient.
- **`src/components/ui/`** — shadcn-generated; never edit, never test.
- **`src/types/database.types.ts`** — auto-generated.

### Use MSW for adapter tests — never mock `fetch` directly
Vendor adapter tests use **MSW (Mock Service Worker)** to intercept HTTP requests. This means the adapter's actual `fetch` calls execute and MSW returns a fake response — the full HTTP layer is exercised. Do not use `vi.mock('node-fetch')` or `vi.spyOn(global, 'fetch')`.

### Mock at the boundary — no over-mocking
Service tests should mock **repositories and adapters** (the layer below the service), not internal functions within the service itself. If you find yourself mocking a private helper inside a service, the logic needs to be extracted or the test is testing the wrong thing.

### Test file co-location
Test files live **next to the file they test**, not in a separate `__tests__/` directory.
- `src/vendors/adapters/cheapshark.ts` → `src/vendors/adapters/cheapshark.test.ts`
- `src/services/search.service.ts` → `src/services/search.service.test.ts`
- `src/schemas/search.schema.ts` → `src/schemas/search.schema.test.ts`

### Lint, typecheck, and tests must all pass before considering work done
Run all three before marking any phase or feature complete:
```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

### Coverage target: services and adapters
Aim for meaningful coverage on the two layers that contain real logic — services and adapters. Do not chase 100% coverage on repositories, controllers, or generated code. Coverage is a signal, not a goal.

---

## CheapShark API

### Never call `GET /game?id=` — it is blocked by Cloudflare
Use `GET /deals?steamAppID={id}&pageSize=60` to get full per-store deal data for a game.

### Cap requests at 1 per second in the polling job
No hard rate limit is documented, but be a good citizen. The poll job processes wishlisted items in batches of 10 with `Promise.allSettled`.

### Store list is fetched from `/stores` and cached — not hardcoded
Active stores change occasionally. Fetch once and cache rather than embedding a static list.
