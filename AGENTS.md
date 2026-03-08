# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

GrantPilot is an AI-powered grant discovery/matching/application platform built with **Next.js 16** (App Router, Turbopack) and **TypeScript**. It has a secondary worker package at `grantpilot-worker/` for Playwright-based form filling. Both use **npm** as the package manager.

### Key services

| Service | How to run | Notes |
|---------|-----------|-------|
| Next.js app | `npm run dev` (port 3000) | Main web UI + API routes |
| Supabase | Cloud project (credentials in `.env`) | Postgres + Auth + Storage |
| Worker | `npm run dev` in `grantpilot-worker/` | Optional; only for grant application automation |
| Inngest dev server | `npx inngest-cli@latest dev` | Optional; for background job testing |

### Supabase (database, auth, storage)

The app uses a **cloud Supabase** project. Credentials are injected as environment secrets: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`.

**Alternatively, for local development with Docker**, you can use `npx supabase start` which provisions a local Postgres, Auth, and Storage stack. The initial schema migration (`supabase/migrations/000_initial_schema.sql`) creates all base tables. All 14 migrations run automatically.

**Cloud Supabase rate limiting:** Supabase cloud enforces email rate limits on sign-up. To create test users without hitting rate limits, use the admin API:
```
curl -X POST "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","email_confirm":true}'
```

### Running commands

- **Dev server:** `npm run dev` — starts on http://localhost:3000
- **Lint:** `npx eslint .` (or `npm run lint`)
- **Build:** `npm run build` — runs `next build`
- **Health check:** `GET /api/health` returns `{"status":"ok"}`

### Non-obvious caveats

- **No Prisma at runtime, no DATABASE_URL needed.** The Prisma schema (`prisma/schema.prisma`) exists for documentation only. The app uses `@supabase/supabase-js` and `@supabase/ssr` for all DB access. There is no `@prisma/client` dependency. Do not run `prisma generate` and do not set `DATABASE_URL`.
- **The `.env` file must exist** with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_APP_URL`, and `ANTHROPIC_API_KEY`. These are injected from Cursor Cloud secrets.
- **Auth-protected routes** (`/dashboard`, `/profile`, `/grants`, `/applications`, `/billing`, `/intelligence`) redirect to `/sign-in` via middleware when no Supabase session exists. The landing page (`/`), sign-in, sign-up, and `/api/*` routes are public.
- **User auto-provisioning:** On first access to a protected route after auth, `lib/auth.ts` (`getCurrentUser`) automatically creates a `User` row, `Organisation`, and `OrganisationMember` (role: OWNER) in the database via the Supabase service key. No separate user-creation webhook is needed. The Supabase select query must include `OrganisationMember(*, Organisation(...))` (note the `*,` inside) to fetch membership columns like `role`; without it, role defaults to MEMBER and billing/admin features break.
- **ESLint config** uses flat config format (`eslint.config.mjs`) with `eslint-config-next`. Run with `npx eslint .`. There are some pre-existing unused-var warnings (not errors).
- **Anthropic API credits:** The `ANTHROPIC_API_KEY` must have sufficient credits for AI features (grant matching, eligibility checks, form filling). If the key has no credits, AI features return 400 errors but the rest of the app works.
- **No automated test suite.** The codebase has no test files, test framework (jest/vitest), or `npm test` script. Testing is manual: start the dev server, sign up, and exercise the UI/API. The health check (`GET /api/health`) and lint (`npx eslint .`) are the only automated checks.
- **External services** (Anthropic, Stripe, Resend, Twilio) require real API keys set in `.env`. See `DEPLOYMENT.md` for the full env var reference. The app functions for basic UI flows without these keys.

### Full system architecture

#### Apply with AI — catalog grants
1. User clicks **"Apply with AI"** on a grant detail page → `POST /api/applications/start`
2. API creates `Application` (FILLING), `cu_sessions` (running), and `cu_session_items` (open_grant_url, fill_company_details, fill_financials, upload_documents, prepare_review; + submit_application if autopilot)
3. Sends notification to org members (email + WhatsApp)
4. Sends Inngest event `app/session.started` → triggers `monitor-session`
5. **Worker** (`grantpilot-worker/`) polls `cu_sessions` every 5s, picks up running sessions
6. Worker uses Playwright + Claude to navigate the grant URL, fill forms, upload documents
7. `monitor-session` (Inngest) polls every 5 min; on completion sends `review_required` notification with approve link

#### Apply with AI — external grant link
1. User pastes URL(s) on `/grants/apply-by-link` → `POST /api/applications/start-with-link`
2. API creates a new `Grant` from the URL, then same flow as catalog grants
3. Supports up to 20 URLs at once, with optional autopilot

#### Grant discovery (internet search)
- **API:** `POST /api/grants/discover` — runs Claude, OpenAI, and Gemini in parallel
- **Cron:** `grant-discovery` Inngest job runs daily at 4:00 UTC for orgs with profile ≥ 30%
- Discovered grants are upserted with `externalId` for deduplication
- Requires `ANTHROPIC_API_KEY`; `OPENAI_API_KEY` and `GEMINI_API_KEY` are optional extra sources

#### Inngest background jobs (cron schedules)
| Job | Schedule | What it does | Needs |
|-----|----------|-------------|-------|
| `grant-sync` | 3:00 UTC | Syncs from JSON feed, Grants.gov, UK, EU sources | Feed URLs |
| `grant-scanner` | 2:00 UTC | Matches grants to profiles (Claude), sends `grant_match` notifications | Anthropic |
| `grant-discovery` | 4:00 UTC | Multi-agent search (Claude + OpenAI + Gemini) | Anthropic (+ optional OpenAI/Gemini) |
| `eligibility-refresh` | 3:00 UTC | Scores grants per profile, upserts `EligibilityAssessment`, sends digest | Anthropic |
| `deadline-reminder` | Every hour | At 9am local time per org, sends reminders for 7/3/1 day deadlines | Resend/Twilio |
| `monitor-session` | Event-driven | Polls worker session status, updates Application, sends notifications | — |

#### Notifications (email + WhatsApp)
- **Email:** Resend (`RESEND_API_KEY`, `EMAIL_FROM`). The verified sender domain is `bizboosters.co.uk` — use `EMAIL_FROM=GrantPilot <contact@bizboosters.co.uk>`.
- **WhatsApp:** Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`)
- Notification types: `application_started`, `review_required`, `application_submitted`, `application_failed`, `deadline_reminder`, `grant_match`, `grant_scan_digest`

#### Token-based actions from email/WhatsApp (no login required)
- **Start application:** `/start-application?token=...` — deadline reminders and digest emails include this link
- **Approve application:** `/approve?token=...` — review-required notifications include this link
- Tokens are HMAC-signed with 7-day TTL; no auth session needed

#### Dashboard data sources
- **Profile Completion %** from `BusinessProfile.completionScore`
- **Suggested grants** (score ≥ 80) and **Within reach** (50-79) from `EligibilityAssessment` — populated by `eligibility-refresh` cron
- **Recent Applications** from `Application` table
- Matched grants appear after `eligibility-refresh` runs (3:00 UTC daily)

#### Running the full system locally
```
npm run dev                                    # Next.js app (port 3000)
cd grantpilot-worker && npm run dev            # Worker (polls cu_sessions)
npx inngest-cli@latest dev                     # Inngest dev server (optional, for cron jobs)
```
Worker needs its own `.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.
