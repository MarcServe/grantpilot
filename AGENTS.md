# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

GrantPilot is an AI-powered grant discovery/matching/application platform built with **Next.js 16** (App Router, Turbopack) and **TypeScript**. It has a secondary worker package at `grantpilot-worker/` for Playwright-based form filling. Both use **npm** as the package manager.

### Key services

| Service | How to run | Notes |
|---------|-----------|-------|
| Next.js app | `npm run dev` (port 3000) | Main web UI + API routes |
| Local Supabase | `npx supabase start` | Postgres + Auth + Storage; requires Docker |
| Worker | `npm run dev` in `grantpilot-worker/` | Optional; only for grant application automation |
| Inngest dev server | `npx inngest-cli@latest dev` | Optional; for background job testing |

### Local Supabase (database, auth, storage)

The app uses a local Supabase instance for development. Docker must be running first.

1. **Start Docker daemon:** `sudo dockerd &>/tmp/dockerd.log &` (if not already running)
2. **Start Supabase:** `npx supabase start` from the repo root
3. **Get credentials:** `npx supabase status` outputs the API URL, anon key, service role key, and DB URL
4. **Update `.env`:** Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, and `DATABASE_URL` with the values from `supabase status`
5. **Mailpit (local email):** http://127.0.0.1:54324 — captures all emails sent by Supabase Auth
6. **Supabase Studio:** http://127.0.0.1:54323 — browser-based DB admin

The initial schema migration (`supabase/migrations/000_initial_schema.sql`) creates all base tables and worker tables. Subsequent migrations (001–014) apply incremental changes. All migrations run automatically on `supabase start`.

Email confirmations are **disabled** in local Supabase (`enable_confirmations = false`), so sign-up auto-confirms users.

### Running commands

- **Dev server:** `npm run dev` — starts on http://localhost:3000
- **Lint:** `npx eslint .` (or `npm run lint`)
- **Build:** `npm run build` — runs `next build`
- **Health check:** `GET /api/health` returns `{"status":"ok"}`

### Non-obvious caveats

- **No Prisma at runtime, no DATABASE_URL needed.** The Prisma schema (`prisma/schema.prisma`) exists for documentation only. The app uses `@supabase/supabase-js` and `@supabase/ssr` for all DB access. There is no `@prisma/client` dependency. Do not run `prisma generate` and do not set `DATABASE_URL`.
- **The `.env` file must exist** with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, and `NEXT_PUBLIC_APP_URL`. With local Supabase running, use the credentials from `npx supabase status`.
- **Auth-protected routes** (`/dashboard`, `/profile`, `/grants`, `/applications`, `/billing`, `/intelligence`) redirect to `/sign-in` via middleware when no Supabase session exists. The landing page (`/`), sign-in, sign-up, and `/api/*` routes are public.
- **User auto-provisioning:** On first access to a protected route after auth, `lib/auth.ts` (`getCurrentUser`) automatically creates a `User` row, `Organisation`, and `OrganisationMember` in the database via the Supabase service key. No separate user-creation webhook is needed.
- **ESLint config** uses flat config format (`eslint.config.mjs`) with `eslint-config-next`. Run with `npx eslint .`. There are some pre-existing lint warnings/errors in the codebase.
- **No automated test suite.** The codebase has no test files, test framework (jest/vitest), or `npm test` script. Testing is manual: start the dev server, sign up, and exercise the UI/API. The health check (`GET /api/health`) and lint (`npx eslint .`) are the only automated checks.
- **External services** (Anthropic, Stripe, Resend, Twilio) require real API keys set in `.env`. See `DEPLOYMENT.md` for the full env var reference. The app functions for basic UI flows without these keys.

### Autonomous grant application flow

The core product feature is AI-powered grant form filling via the `grantpilot-worker`. The flow is:

1. **User clicks "Apply with AI"** on a grant → `POST /api/applications/start`
2. API creates an `Application` (status: FILLING), a `cu_sessions` row, and `cu_session_items` for each step (open URL, fill company, fill financials, upload docs, prepare review, optionally submit)
3. **Worker** (`grantpilot-worker/`) polls `cu_sessions` every 5s, picks up running sessions
4. Worker uses **Playwright** (headless Chromium) to navigate the grant form and **Anthropic Claude** to map profile data → form fields
5. On completion, Application status becomes `REVIEW_REQUIRED` (or `SUBMITTED` in autopilot mode)

**To test this locally, you need:**
- Local Supabase running (`npx supabase start`)
- Next.js app running (`npm run dev`)
- Worker running (`cd grantpilot-worker && npm run dev`)
- A real `ANTHROPIC_API_KEY` (required for Claude-based form mapping)
- A grant with a reachable `applicationUrl` (the worker navigates to it in a real browser)
- A completed business profile with documents uploaded to Supabase Storage
