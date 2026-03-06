# AGENTS.md

## Cursor Cloud specific instructions

### Overview

GrantPilot is a Next.js 16 (App Router) grant discovery/matching/auto-application SaaS. The main app lives at the repo root; a standalone Playwright worker is in `grantpilot-worker/`.

### Quick reference

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` (port 3000) |
| Build | `npm run build` |
| Lint | `npx eslint .` |
| Health check | `curl http://localhost:3000/api/health` |

### Environment variables

The app requires a `.env.local` at the repo root with at minimum:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_KEY` — Supabase service role key
- `NEXT_PUBLIC_APP_URL` — e.g. `http://localhost:3000`
- `ANTHROPIC_API_KEY` — required for AI grant matching features

Without real Supabase credentials, the landing page (`/`), sign-in (`/sign-in`), sign-up (`/sign-up`), and health endpoint (`/api/health`) still render. Auth-dependent routes (dashboard, profile, grants, etc.) redirect to `/sign-in`.

### Inngest (background jobs)

Inngest powers 6 background functions (crons + event-driven). For local dev, run the Inngest dev server alongside `npm run dev`:

```
npx inngest-cli@latest dev
```

The dev server auto-discovers functions via `GET /api/inngest`. Without it, crons will not fire and `inngest.send()` events go nowhere.

For production, set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` and sync the app via Inngest Cloud (or the Vercel integration). Without the signing key the serve endpoint stays in dev mode and rejects Inngest Cloud requests.

### Stripe billing

Stripe checkout requires these env vars in `.env.local`:

- `STRIPE_SECRET_KEY` — server-side API key
- `STRIPE_WEBHOOK_SECRET` — webhook signature verification
- `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` — Stripe Price ID for the Pro plan
- `NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID` — Stripe Price ID for the Business plan

Without the `NEXT_PUBLIC_STRIPE_*` price IDs the Upgrade buttons on `/billing` will not render (by design — the component guards on truthy `priceId`). For local webhook testing use `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

### grantpilot-worker (Fly.io)

The worker is a long-running Node.js process that polls `cu_sessions` in Supabase and fills grant applications via Playwright. It exposes a health endpoint on port 8080 for Fly.io health checks. Key `fly.toml` settings:

- `auto_stop_machines = 'off'` — worker must stay running even without HTTP traffic
- `min_machines_running = 1` — always keep one machine active
- `memory = '1gb'` — Playwright/Chromium needs at least 1 GB RAM

### Gotchas

- **No Prisma runtime dependency.** The repo has `prisma/schema.prisma` for schema documentation only; all DB access uses the Supabase JS client. Do not run `prisma generate` or `prisma db push`.
- **Package manager is npm** (lockfile: `package-lock.json`). Do not use pnpm/yarn.
- **ESLint has 4 pre-existing `prefer-const` errors** in the codebase. These are not caused by environment issues.
- **No automated test suite** exists (no `test` script in `package.json`). Lint (`npx eslint .`) and build (`npm run build`) are the primary verification commands.
- The `grantpilot-worker/` sub-package is optional for local dev; it requires Playwright browsers and is only needed for the auto-apply flow.
- **Claude JSON responses** may be wrapped in markdown code fences. `lib/claude.ts` strips these before parsing.
