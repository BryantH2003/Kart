# Kart

A smart shopping assistant that helps users find the best deals and make informed purchase decisions — without having to do the research themselves.

## What It Does

Users add products to a wishlist and Kart tracks them over time, providing:

- **Cross-vendor price comparison** — see the same product across all onboarded retailers at once
- **Price history charts** — 90-day daily price trends so you can see if a "deal" is actually a deal
- **Price drop alerts** — email notification when a tracked item hits your target price
- **AI buy/wait recommendations** — natural language advice based on price history, seasonal patterns, and trends ("This TV historically drops 22% before Black Friday — you have 6 weeks")
- **Upcoming deals tracking** — surface active sale events for tracked products

Search and product pages are publicly accessible. Wishlist and alerts require an account.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14+ (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Background jobs | Supabase pg_cron + Edge Functions |
| Vendors (MVP) | CheapShark API (free, no key required) |
| Email alerts | Resend |
| AI recommendations | Groq (Llama 3 8B) |
| Source control | GitLab |
| CI/CD | GitLab CI/CD |
| Hosting | Railway |

## Architecture

### Vendor Adapter Pattern
Each retailer is implemented as an adapter behind a common interface. Adding a new vendor requires writing one adapter file and adding one line to the registry — zero changes to the rest of the codebase.

### Controller → Service → Repository
- **Controllers** (`app/api/`) — parse and validate input, delegate to one service, return HTTP response
- **Services** (`services/`) — all business logic; no HTTP concerns, no raw SQL
- **Repositories** (`repositories/`) — all database queries; no business logic

### Auth Facade
`lib/auth/index.ts` provides a provider-agnostic interface. Only `lib/auth/providers/supabase.ts` ever calls `supabase.auth`. Swapping to a different auth provider means writing one new provider file.

## Getting Started

See [PLAN.md](./PLAN.md) for the full implementation plan, database schema, and build phases.

### Prerequisites
- Node.js 18+
- Supabase CLI (`npm install -g supabase`)
- Accounts for: Supabase, Best Buy Developer API, Resend, Groq, Vercel

### Environment Variables

```bash
cp .env.example .env.local
```

Required variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
UNSUBSCRIBE_SECRET=
GROQ_API_KEY=
# CheapShark requires no API key
```

### Database Setup

```bash
supabase link --project-ref <your-project-ref>
supabase db push
supabase gen types typescript --project-id <your-project-ref> > src/types/database.types.ts
```

### Development

```bash
npm install
npm run dev
```

### Deploy Edge Functions

```bash
supabase functions deploy poll-prices
supabase secrets set RESEND_API_KEY=... GROQ_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
```

## Project Status

Pre-development. See [PLAN.md](./PLAN.md) for the phased build plan.

## Deployment

Pushes to `main` trigger the GitLab CI/CD pipeline (`.gitlab-ci.yml`), which:
1. Runs lint + TypeScript checks
2. Deploys to Railway via the Railway CLI

`RAILWAY_TOKEN` is stored as a masked, protected variable in GitLab CI/CD Settings. All other app secrets are stored in the Railway dashboard and injected at runtime — they never touch GitLab.

### Build Phases
- [ ] Phase 0 — External service setup
- [ ] Phase 1 — Database schema + migrations
- [ ] Phase 2 — Project scaffold
- [ ] Phase 3 — Vendor adapter layer (CheapShark)
- [ ] Phase 4 — Repositories
- [ ] Phase 5 — Services
- [ ] Phase 6 — API routes
- [ ] Phase 7 — Edge function + pg_cron
- [ ] Phase 8 — Frontend

## Adding a New Vendor

1. Write `src/vendors/adapters/<vendor>.ts` implementing `VendorAdapter`
2. Add one line to `src/vendors/registry.ts`
3. `INSERT INTO vendors VALUES ('<id>', '<name>', true, '{"rateLimit": N}');`

That's it. No other code changes required.

## Security Notes

- RLS is enabled on all tables — the anon key is safe to expose client-side
- The service role key bypasses RLS — never expose it outside server/edge function contexts
- All API inputs are validated with Zod before touching the database
- Every mutation includes an explicit user ownership check as a second layer under RLS
- All alert emails include an HMAC-signed unsubscribe link (CAN-SPAM compliant)
