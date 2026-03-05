# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

GrantPilot is an AI-powered grant discovery/matching/application platform built with **Next.js 16** (App Router, Turbopack) and **TypeScript**. It has a secondary worker package at `grantpilot-worker/` for Playwright-based form filling. Both use **npm** as the package manager.

### Key services

| Service | How to run | Notes |
|---------|-----------|-------|
| Next.js app | `npm run dev` (port 3000) | Main web UI + API routes |
| Worker | `npm run dev` in `grantpilot-worker/` | Optional; only for grant application automation |
| Inngest dev server | `npx inngest-cli@latest dev` | Optional; for background job testing |

### Running commands

- **Dev server:** `npm run dev` — starts on http://localhost:3000
- **Lint:** `npx eslint .` (or `npm run lint`)
- **Build:** `npm run build` — runs `next build`
- **Health check:** `GET /api/health` returns `{"status":"ok"}`

### Non-obvious caveats

- **Prisma schema exists but is not used at runtime.** The app uses `@supabase/supabase-js` and `@supabase/ssr` for all DB access. There is no `@prisma/client` dependency. Do not try to run `prisma generate` — it will fail with the latest Prisma CLI (v7 breaking changes) and is not needed.
- **The `.env` file must exist** with at least `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL` for the dev server to start. Placeholder values are fine for local UI development; real Supabase credentials are needed for auth/database flows.
- **Auth-protected routes** (`/dashboard`, `/profile`, `/grants`, `/applications`, `/billing`, `/intelligence`) redirect to `/sign-in` via middleware when no Supabase session exists. The landing page (`/`), sign-in, sign-up, and `/api/*` routes are public.
- **ESLint config** uses flat config format (`eslint.config.mjs`) with `eslint-config-next`. Run with `npx eslint .`. There are some pre-existing lint warnings/errors in the codebase.
- **External services** (Supabase, Anthropic, Stripe, Resend, Twilio) require real API keys set in `.env`. See `DEPLOYMENT.md` for the full env var reference.
