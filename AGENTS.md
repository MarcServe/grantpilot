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

### Gotchas

- **No Prisma runtime dependency.** The repo has `prisma/schema.prisma` for schema documentation only; all DB access uses the Supabase JS client. Do not run `prisma generate` or `prisma db push`.
- **Package manager is npm** (lockfile: `package-lock.json`). Do not use pnpm/yarn.
- **ESLint has 4 pre-existing `prefer-const` errors** in the codebase. These are not caused by environment issues.
- **No automated test suite** exists (no `test` script in `package.json`). Lint (`npx eslint .`) and build (`npm run build`) are the primary verification commands.
- The `grantpilot-worker/` sub-package is optional for local dev; it requires Playwright browsers and is only needed for the auto-apply flow.
