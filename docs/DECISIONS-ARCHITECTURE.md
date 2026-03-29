# Kart — Architectural Decisions

Architectural decisions about system design, technology choices, patterns, and project structure. These are the choices that shaped the overall shape of the codebase — the kind of decisions you'd revisit if requirements changed significantly or if the project were handed to a new team.

For code-level decisions (schema performance, query optimization, tooling fixes), see [`DECISIONS-IMPLEMENTATION.md`](./DECISIONS-IMPLEMENTATION.md).

---

## 1. Finding a Data Source: Three Dead Ends Before One That Worked

### The Problem
Kart's core feature is cross-vendor price comparison. That means we need a reliable, accessible API for product and pricing data. Getting that data turned out to be the first real obstacle.

### Attempt 1 — Best Buy API
Best Buy has a well-documented developer API. We applied for access and immediately hit a wall: the registration form rejects free email addresses (Gmail, Outlook, etc.) and `.edu` addresses. The error message makes clear this is a business-tier product. We then tried registering with a work email — and hit a second wall: the work domain required internal administrative approval, and the approving admin was no longer with the company.

**Dead end.** The API exists but is practically inaccessible without a corporate relationship.

### Attempt 2 — eBay API
eBay Developer Program seemed like a natural pivot. We went through registration and were immediately rejected with a generic error about "problems with the data provided." No explanation, no appeal path. eBay's developer program has become notoriously difficult to access for individual developers.

**Dead end.** Access rejected with no recourse.

### What We Learned
External developer programs that require account approval are a real dependency risk at the start of a project. Even well-known APIs can be inaccessible for non-business applicants. This is worth verifying before designing your entire data model around a specific vendor.

### The Solution — CheapShark
CheapShark is a free, open API that aggregates PC game prices across 15+ storefronts including Steam, GOG, Humble, Green Man Gaming, Fanatical, and Epic. No registration. No API key. No approval process.

This also turned out to be a better MVP choice architecturally: one API call returns prices from 15 stores simultaneously, which is the core value proposition of Kart (cross-store comparison) delivered in a single integration. We get more breadth with less complexity.

**The trade-off:** we're now dependent on CheapShark's continued operation and data quality. We mitigate this through the vendor adapter pattern (see below) so the system works with any number of data sources — CheapShark is just the first.

### One Gotcha Discovered During Testing
After integrating CheapShark, we found that the `GET /game?id=` endpoint is blocked by Cloudflare and returns an HTML error page instead of JSON. This only surfaces at runtime, not during development with static test data. The correct endpoint for fetching per-store deals for a specific game is `GET /deals?steamAppID={id}`. This is documented in the project rules and the adapter to prevent the mistake from being repeated.

---

## 2. Vendor Adapter Pattern: Designing for Vendors We Don't Have Yet

### The Problem
If we wire CheapShark API calls directly into the search service or product service, adding a second vendor later means touching business logic code, the search flow, the product page aggregation, and the polling job. Every new vendor is a modification of existing code rather than an addition alongside it.

### The Decision
We introduced a `VendorAdapter` interface that every data source must implement. The interface defines a fixed contract: `search()` and `getProduct()`. The adapter layer lives in `src/vendors/adapters/` — one file per vendor. A registry (`src/vendors/registry.ts`) maps vendor IDs to their implementations.

Services only ever call the registry. They do not know which vendor they are talking to.

### What This Means in Practice
Adding a second vendor — say, a direct eBay integration — is exactly three steps:
1. Write `src/vendors/adapters/ebay.ts` implementing `VendorAdapter`
2. Add one line to `src/vendors/registry.ts`
3. Insert one row into the `vendors` database table

No changes to any service, repository, API route, or frontend component. The search service fans out to all registered adapters automatically.

### The Trade-off
The adapter interface forces normalization. CheapShark returns a `steamRatingPercent` (0–100). The adapter must normalize that to a 0–10 scale for the `rating` field. Amazon returns 1–5 stars. The adapter normalizes that to 0–10 as well. This means the interface is opinionated about what "rating" means, and every adapter inherits that opinion. If a vendor has data that genuinely doesn't fit the interface, we have to either extend the interface (affecting all adapters) or put it in the `metadata JSONB` column.

So far, the `metadata JSONB` escape hatch has handled every vendor-specific field without needing to touch the interface.

---

## 3. Auth Facade: Keeping the Door Open to Swap Auth Providers

### The Problem
Supabase Auth is a good starting point — it handles email/password, Google OAuth, session management, and JWT verification out of the box. But auth providers come and go. Clerk became popular. Firebase Auth is widespread. Auth0 is standard in enterprise. If we call `supabase.auth.*` throughout the codebase, swapping providers later means touching every file that ever checked a session.

### The Decision
We built a thin auth facade at `src/lib/auth/index.ts`. It exports `auth.getUser()` and `auth.requireUser()`. Exactly one file — `src/lib/auth/providers/supabase.ts` — is allowed to call `supabase.auth.*` directly. Everything else in the codebase imports from the facade.

The facade interface is:
```typescript
interface AuthProvider {
  getUser(): Promise<AuthUser | null>
  requireUser(): Promise<AuthUser>  // redirects to /auth/login if no session
}
```

### What Swapping Looks Like
To move from Supabase Auth to Clerk: write `src/lib/auth/providers/clerk.ts`, update one import line in `src/lib/auth/index.ts`. Nothing else changes.

### The Trade-off
The facade is deliberately thin. It does not expose session refresh, token introspection, OAuth redirect helpers, or other provider-specific functionality. If you need those, you reach into the provider file directly — but that's a conscious choice that shows up clearly in the code (a direct import from the provider file, not the facade). This makes provider-specific usage visible and auditable.

---

## 4. Controller → Service → Repository: Why Three Layers for a Small App

### The Problem
For a small app, a three-layer architecture can feel like over-engineering. But the specific failure mode we were trying to prevent is concrete: without the separation, business logic ends up in route handlers, database queries end up in components, and the whole thing becomes untestable and unmaintainable as it grows.

### The Decision
Every request flows through exactly three layers:

**Controller** (Next.js route handler) — Parse the request with Zod, call auth if the route is protected, call one service method, return a response. No SQL. No business logic.

**Service** — Business logic lives here. Calls repositories and vendor adapters. Has no knowledge of HTTP — it never sees a `Request` or `Response` object.

**Repository** — Supabase queries only. Returns typed data. No branching logic.

### Why This Specific Separation
The controller/service split means we can call service methods from anywhere — a route handler, a cron job, a background worker — without duplicating logic. The service/repository split means every database query has exactly one home, making it easy to find, audit, and optimize.

### The Real Benefit Showed Up During Schema Work
When we added indexes in migration 004, we could look at the repository files and know exactly what queries existed against each table. If queries were scattered across service files, route handlers, and components, identifying the access patterns for index planning would have required searching the entire codebase.

---

## 5. Database Migrations: Why the Dashboard is Dangerous

### The Problem
Supabase provides a dashboard where you can click to create tables, add columns, and configure Row Level Security policies. This is convenient for rapid prototyping but creates a serious problem: the dashboard changes are not version-controlled. If you click to add a column in development and forget to replicate it before deploying, your production schema drifts silently. There's no diff. There's no rollback. There's no way to reproduce the exact schema on a fresh database.

### The Decision
Every schema change — every table, every column, every index, every RLS policy, every constraint — lives in a migration file under `supabase/migrations/`. The dashboard is used for reading data and monitoring only. Never for writing schema.

This means:
- The migration files are the source of truth for what the database looks like
- A fresh deployment of the project can reproduce the exact schema with `supabase db push`
- Schema history is auditable in git: who changed what, when, and why

### RLS Policies as SQL
Row Level Security policies are particularly easy to misconfigure via the dashboard (it's just text boxes). We put every RLS policy in `002_rls_policies.sql` so they're reviewable in code review, reproducible, and not dependent on anyone remembering what they clicked.

### The Numbering Convention
Migration files use sequential numeric prefixes (`001_`, `002_`, `003_`). Early in development, we deleted one migration and merged its content into an earlier one to avoid carrying redundant files. The rule: **pre-production, you can consolidate migrations freely. Once you've deployed to a real environment with real data, migrations are append-only.** Modifying or deleting an applied migration will break `supabase db push` on any environment that has already run it.

---

## 6. Cron Jobs and Secrets in a Public Repository

### The Problem
The price polling job is scheduled via `pg_cron`, a PostgreSQL extension. The cron job calls the `poll-prices` Supabase Edge Function using an HTTP POST with an `Authorization: Bearer <token>` header. That token needs to be in the SQL that registers the cron job.

If the cron job registration lived in a migration file, the token would be committed to the repository in plaintext. For a public repository, this is a hard security failure.

### What We Considered
**Option A: Put the cron job in a migration with a placeholder** — The migration would have `<CRON_SECRET>` which you manually replace before running. Problem: if you ever accidentally run `supabase db push` without replacing the placeholder, you register a cron job with a literal `<CRON_SECRET>` as its auth token, which then silently fails every hour.

**Option B: Put the cron job setup in a manually-run script outside of migrations** — The setup script lives in `scripts/setup-cron-jobs.sql`. It uses `${CRON_SECRET}` and `${SUPABASE_PROJECT_ID}` as shell-style variable placeholders. A companion shell script (`scripts/run-cron-setup.sh`) reads `.env.local`, uses `envsubst` to substitute real values, and pipes the result to `supabase db execute`. The template SQL (with placeholders) is safe to commit. The real values never touch a committed file.

### The Decision
Option B. The cron job setup is a one-time manual step, not part of the automated migration flow. This is explicitly documented and enforced in the project rules.

### The Wider Principle
This exposed a general rule: **anything that references a secret cannot be a migration**. Migrations run automatically on deployment. If a migration contains a secret, either the secret is committed to version control, or the deployment breaks silently when the placeholder isn't replaced. Manual scripts with runtime substitution are the right tool for any setup step that involves secrets.

---

## 7. Designing for Vendors We Haven't Written Yet

### The Problem
The initial schema was designed with CheapShark in mind. Many of its assumptions only hold for a PC game aggregator:

- `canonical_products.external_id` — a single text field assumes every product has one universal identifier. Works for Steam App IDs. Breaks when you add physical goods (UPCs), Amazon listings (ASINs), and eBay items (temporary numeric Item IDs) which live in different namespaces.
- No way to distinguish between vendor types. CheapShark is an aggregator (one entry, data from 15 stores). Best Buy is a direct retailer (one entry, one store). eBay is a marketplace (one entry, thousands of seller listings). An adapter for eBay behaves fundamentally differently from an adapter for Best Buy, but the schema treated all vendors identically.
- No vendor-specific metadata storage. Adding eBay means tracking seller condition, seller location, auction end time. Adding Best Buy means tracking model number, in-store vs. online availability. Every new vendor was going to require new columns.
- No soft-delete on `vendor_products`. When an eBay listing ends or a Best Buy SKU is discontinued, the row would need to be deleted — taking all price history with it.

### The Decisions

**`external_id_type` + composite unique index:** Added `external_id_type TEXT` to `canonical_products` and replaced the single `UNIQUE(external_id)` constraint with a partial composite unique index on `(external_id_type, external_id)`. Steam App ID `"8930"` and a hypothetical UPC `"000008930..."` are now distinct because they have different types. Products without a universal identifier can have a NULL external_id.

**`vendor_type` on the vendors table:** Added `CHECK (vendor_type IN ('aggregator', 'retailer', 'marketplace'))`. Adapters and services read this field rather than branching on vendor ID strings. The application logic is decoupled from the specific vendor being called.

**`metadata JSONB` on both `canonical_products` and `vendor_products`:** Category-specific fields (game genres, physical goods dimensions, eBay seller data) go here rather than requiring schema changes per vendor. The adapter populates what it has. The frontend reads what it finds.

**`is_active BOOLEAN` on `vendor_products`:** Listings are soft-deleted, not hard-deleted. Price history is preserved. The polling job filters to `WHERE is_active = true`.

**`sync_status` and `sync_error` on `vendor_products`:** Without these, there is no way to distinguish between "this product has never been polled" and "this product's vendor API has been returning 500s for three days." Both look identical as a NULL `last_synced`. With sync status, the monitoring story becomes: query for `sync_status = 'error'` to see what's broken.

**`pre_order` added to the `availability` CHECK constraint:** Changing a CHECK constraint on a large table is expensive — it rewrites the constraint validation for every existing row. Adding `pre_order` now (while the table is empty) costs nothing. Adding it later when the table has millions of hourly snapshot rows would cause significant write downtime.

### The Principle
The question to ask about any table before finalizing its migration is: *what assumptions am I encoding here that only hold for the current vendor?* Those assumptions are the ones that will cost a painful migration later.

---

## 8. Monorepo vs. Flat Structure

### The Question
Early in Phase 2, the question came up of whether to organize the project into separate directories for the database layer, backend, and web app — a monorepo-style structure with `apps/web/`, `packages/database/`, etc.

### Why We Didn't
The project is a single Next.js application backed by a single Supabase instance. There is one deployable artifact, one CI/CD pipeline, one Railway service. The "clutter" at the root is standard JavaScript project configuration that every developer expects to find there.

A monorepo reorganization would have meant:
- Next.js config files (`package.json`, `next.config.ts`, `middleware.ts`) move to `apps/web/` — they're just in a subdirectory now instead of the root
- Supabase CLI commands need a `--project-dir packages/database` flag on every invocation
- Railway needs a root directory override in its deployment settings
- All existing `@/` import aliases still resolve the same way — no actual gain

**The rule:** reach for a monorepo when you have multiple deployable artifacts that share code. For a single app, the standard flat structure is less overhead, not more.

---

## 9. Choosing a Test Runner: Vitest over Jest

### The Problem
We needed a test runner that works cleanly with a modern TypeScript + Next.js project. The default choice in the ecosystem has historically been Jest, but Jest was designed in the CommonJS era and requires non-trivial configuration to handle ESM modules and TypeScript paths.

### Why Jest Is Difficult Here
Next.js uses ESM by default. Jest's ESM support requires either Babel transforms (which defeats the purpose of native TypeScript) or an experimental `--experimental-vm-modules` flag. Getting Jest to respect the `@/` path alias from `tsconfig.json` requires a separate `moduleNameMapper` config. There are known incompatibilities between Jest's module system and certain Next.js internals. Getting all of this to work is possible but adds 30–60 minutes of yak-shaving before writing a single test.

### The Decision: Vitest
Vitest is a test runner built on top of Vite. It has the same API as Jest (`describe`, `it`, `expect`, `vi.fn()`, `vi.mock()`) so the learning curve is minimal, but it works with native TypeScript and ESM out of the box. The `tsconfig.json` `paths` aliases are respected automatically. There is no Babel pipeline. It is significantly faster than Jest on cold starts because it shares Vite's module graph.

The only meaningful trade-off: Vitest is a younger project than Jest and has a smaller plugin ecosystem. For our use case (unit testing pure TypeScript logic), this is not a constraint.

### Testing Philosophy Established
Alongside the framework choice, we established what to test and what not to test:
- **Adapters** — the normalization logic that transforms raw vendor API responses. These are pure functions and are the highest-value tests in the project.
- **Services** — the business logic layer. Mock repositories and adapters; test the decision logic.
- **Zod schemas** — fast tests for validation boundaries.
- **Repositories** — not unit tested. They are thin Supabase query wrappers. Testing them with mocks just tests that you can call `.eq()` on a mock object.
- **Controllers** — not unit tested. They have no logic. TypeScript + Zod coverage is sufficient.

The rule: test where logic lives. Don't test where there is no logic to break.

---

## 10. Next.js 16: middleware.ts → proxy.ts

### The Problem
After scaffolding the project with `create-next-app`, the session middleware (Supabase auth session refresh) lived in `middleware.ts` at the project root, exporting `middleware()` and `config`. This is the standard Next.js 13–15 pattern. When applying the `next-best-practices` skill during Phase 3, we discovered that Next.js 16 replaced this mechanism.

### What Changed
Next.js 16 introduces `proxy.ts` as the replacement for `middleware.ts`. The export name changes from `middleware` to `proxy`, and the config export changes from `config` to `proxyConfig`. The old `middleware.ts` file is no longer loaded by the runtime in Next.js 16 projects.

If we had shipped with `middleware.ts`, the session refresh logic would silently not run — every route would behave as if there were no middleware at all. Auth-gated routes would appear to work (client-side redirects would still fire) but server-side session state would never be refreshed, causing session expiry issues that are difficult to debug.

### The Decision
Delete `middleware.ts`, create `proxy.ts` exporting `proxy()` and `proxyConfig`. The logic inside is identical — only the file name and export names changed. Add a project rule to CLAUDE.md so future edits know to maintain `proxy.ts`, not `middleware.ts`.

### The Trade-off
None significant. This is a breaking rename in the framework. The only risk is forgetting the convention when returning to the codebase — hence the CLAUDE.md rule.

---

*Add an entry here whenever a pattern, technology choice, or system-level structure decision is made. Focus on the "why" — what problem was being solved and what alternatives were ruled out.*
