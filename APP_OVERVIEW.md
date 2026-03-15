# Grants-Copilot — Full App Overview

This document describes how the application works: features, user actions, background jobs, and system architecture.

---

## 1. Project summary

**Grants-Copilot** (codebase: GrantPilot) is an AI-powered grant discovery, matching, and application platform.

- **Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Supabase (Postgres, Auth, Storage). Optional worker: Playwright + Claude for form filling.
- **Package manager:** npm.
- **Main app:** `npm run dev` → http://localhost:3000. Worker: `npm run dev` in `grantpilot-worker/`.

---

## 2. Authentication and access

- **Auth provider:** Supabase Auth (email/password). No Prisma at runtime; all DB access via `@supabase/supabase-js` and `@supabase/ssr`.
- **User provisioning:** On first access to a protected route, `getCurrentUser` (lib/auth.ts) creates a `User` row, an `Organisation`, and an `OrganisationMember` (role: OWNER) via the Supabase service key. No separate sign-up webhook required.
- **Protected routes:** `/dashboard`, `/profile`, `/grants`, `/applications`, `/billing`, `/intelligence`, `/admin`. Unauthenticated users are redirected to `/sign-in` with a `redirect` query param.
- **Public routes:** `/`, `/sign-in`, `/sign-up`, `/start-application`, `/approve`, and all `/api/*` routes. Token-based actions (start application, approve) do not require login.

---

## 3. Routes and pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/sign-in`, `/sign-up` | Auth; after login redirect to `redirect` or `/dashboard` |
| `/dashboard` | Overview: profile completion, applications count, suggested/within-reach grants, tasks, notification prefs |
| `/profile` | Business profile (multi-step form), notification channels, eligibility digest preferences |
| `/grants` | Browse grants (from sync + discovery) |
| `/grants/[id]` | Grant detail: eligibility score, Apply with AI, edit application URL, similar grants |
| `/grants/apply-by-link` | Paste external grant URL(s); start application(s) with AI (up to 20 URLs, optional autopilot) |
| `/applications` | List of applications with status |
| `/applications/[id]` | Application detail: status, tasks, snapshot, approve/cancel/delete |
| `/billing` | Subscription, plan limits, Stripe checkout/portal |
| `/intelligence` | Explains form intelligence, portal automation, eligibility; eligibility notification preferences; link to grants/applications |
| `/admin` | Admin-only: grant import, test notification |
| `/start-application?token=...` | **No-login:** open link → application starts automatically (one-click from email/WhatsApp) |
| `/approve?token=...` | **No-login:** approve and submit application from link in review-required notification |

---

## 4. Dashboard

- **Profile completion %:** From `BusinessProfile.completionScore`. Link to complete profile if &lt; 100%.
- **Total / active applications:** Counts from `Application` (active = FILLING or REVIEW_REQUIRED).
- **Available grants:** Link to `/grants`; copy explains “Complete your profile first” or “Get AI-powered grant matches”.
- **Suggested grants:** From `EligibilityAssessment` where score ≥ 80 and grant matches org’s `funderLocations`. Shown only if profile completion ≥ 50%.
- **Within reach:** Same source, score 50–79.
- **Recent applications:** Last 5 with status (including STOPPED when failed + stopped).
- **Upcoming tasks:** From `ApplicationTask` (not done/cancelled), with grant names.
- **Notification channels:** Card to set phone number and WhatsApp opt-in for the user.

Data for suggested/within-reach is filled by the **eligibility-refresh** Inngest job (runs 7:30 UTC).

---

## 5. Business profile

- **Multi-step form** (ProfileForm):  
  - Step 1: Business name, registration number, location, funder regions (US, UK, EU, Global).  
  - Step 2: Sector, mission statement, description.  
  - Step 3: Employee count, annual revenue.  
  - Step 4: Funding min/max, purposes, details, previous grants.  
  - Step 5: Documents (upload via `/api/profile/documents/upload`).
- **Completion score:** Computed from filled fields and document count; stored on `BusinessProfile.completionScore`. Used for matching and eligibility.
- **Notification preferences:** Phone number and WhatsApp opt-in (saved to User).
- **Eligibility digest preferences:** On Intelligence page; control whether org receives eligibility digest (e.g. grant_scan_digest) via email/WhatsApp.
- **Other profile APIs:**  
  - `GET/PUT /api/profile/funding-strategy`  
  - `GET/PUT /api/profile/eligibility-preferences`  
  - `GET/PUT /api/profile/notification-channels`

---

## 6. Grants

- **Source of grants:** Sync (grant-sync cron: JSON feed, Grants.gov, UK, EU), discovery (grant-discovery cron + grant-discovery-process queue), and one-off “Apply by link” (new grant created from URL).
- **Grants list:** Filter/browse; link to detail.
- **Grant detail (`/grants/[id]`):**  
  - Name, funder, amount, deadline, application URL, eligibility text, description, sectors, regions.  
  - **Eligibility score** (from `EligibilityAssessment`) and improvement tips when profile exists.  
  - **Apply with AI** button → starts application (subject to plan limits).  
  - Edit application URL (if grant form URL differs).  
  - Required attachments vs. profile documents: missing document labels shown.  
  - Similar grants (same funder or sector).  
  - Optional: Find application form (Playwright Scout), auto-improve eligibility (AI).
- **Apply by link:** User pastes URL(s) on `/grants/apply-by-link` → `POST /api/applications/start-with-link` creates Grant(s) and starts application(s) (same flow as catalog grants; optional autopilot).
- **APIs:**  
  - `POST /api/grants/discover` — manual discovery (Claude + optional OpenAI/Gemini).  
  - `GET /api/grants/eligibility-scores`, `GET /api/grants/[id]/eligibility` — eligibility data.  
  - `GET /api/grants/[id]`, `PATCH /api/grants/[id]` — grant CRUD.  
  - `POST /api/grants/[id]/scout-form-link` (enqueue Playwright Scout for form URL), `POST /api/grants/[id]/parse-requirements` — AI.  
  - `GET /api/grants/saved`, `GET /api/grants/match` — saved list and matching.

---

## 7. Applications

- **Start (catalog):** User clicks “Apply with AI” on grant detail → `POST /api/applications/start` (profile + grant from app). Creates `Application` (FILLING), `cu_sessions`, `cu_session_items`, notifies org, sends Inngest `app/session.started`, worker picks up session.
- **Start by token (no login):** User opens `/start-application?token=...` from email/WhatsApp → page auto-submits to `POST /api/applications/start-by-token` → one-click start, then success or “already started”.
- **Start with link:** `POST /api/applications/start-with-link` (body: URL(s), optional autopilot) → creates Grant(s) then same as catalog start.
- **Application statuses:** PENDING, FILLING, REVIEW_REQUIRED, APPROVED, SUBMITTED, FAILED (and STOPPED in UI when failed + stopped).
- **Actions on application detail:**  
  - **Approve & submit:** User (or token link) approves → `POST /api/applications/approve` (or approve by token).  
  - **Cancel:** `POST /api/applications/[id]/cancel`.  
  - **Delete:** `POST /api/applications/[id]/delete`.  
  - **Snapshot:** `GET /api/applications/[id]/snapshot` (filled form snapshot).  
  - **Save to profile:** `POST /api/applications/[id]/save-to-profile` (e.g. save answers to profile for reuse).
- **Start check:** `POST /api/applications/start-check` — used to check if an application can be started (e.g. limit, existing app).

---

## 8. Apply with AI — end-to-end flow

1. **Start:** User or token triggers start → API creates `Application` (FILLING), `cu_sessions` (running), `cu_session_items` (e.g. open_grant_url, fill_company_details, fill_financials, upload_documents, prepare_review; plus submit_application if autopilot).
2. **Notification:** Org members get `application_started` (email + WhatsApp).
3. **Inngest:** `app/session.started` → **monitor-session** function runs (polls worker session status).
4. **Worker:** `grantpilot-worker` polls `cu_sessions` every 5s, picks running sessions, uses Playwright + Claude to open grant URL, fill forms, upload documents.
5. **Completion:** When worker finishes, monitor-session updates Application (e.g. REVIEW_REQUIRED), sends **review_required** notification with link to approve (and `/approve?token=...` for no-login).
6. **Approve:** User (or link) approves → submission triggered; **application_submitted** or **application_failed** notification.

All apply links in notifications use **Apply with GrantsCopilot (no login)** copy and `/start-application?token=...` where a token is available; approve links use `/approve?token=...`.

---

## 9. Token-based actions (no login)

- **Start application:** `/start-application?token=...`. Token is HMAC-signed, 7-day TTL; contains grantId, profileId, organisationId. Opening the link auto-starts the application (one click).
- **Approve:** `/approve?token=...` + `POST /api/applications/approve` with token. Same 7-day HMAC; no auth required.

Used in: deadline reminders, eligibility digest, high-match notifications (grant_match_high). WhatsApp grant_match_high template link points to start-application URL when token is present.

---

## 10. Notifications

- **Channels:** Email (Resend; sender e.g. `Grants-Copilot <contact@bizboosters.co.uk>`), WhatsApp (Twilio Content Templates for business-initiated messages).
- **Types:**  
  - `application_started` — application has started.  
  - `review_required` — form filled, approve/submit (with approve token link).  
  - `application_submitted` — submitted successfully.  
  - `application_failed` — issue during processing.  
  - `deadline_reminder` — 7/3/1 day before deadline; includes start-application link when token present.  
  - `welcome` — after sign-up.  
  - `grant_match` — nightly scanner found matches (generic).  
  - `grant_match_high` — high eligibility score for one grant; link = start-application when token present.  
  - `grant_scan_digest` — eligibility digest; per-grant “Apply with GrantsCopilot (no login)” links.  
  - `subscription_activated`, `subscription_upgraded`, `subscription_cancelled` — billing.

Templates and copy live in `lib/notification-templates.ts`; sending in `lib/notify.ts` (notifyUser, notifyOrgMembers).

---

## 11. Inngest background jobs

| Job | Schedule / trigger | Purpose |
|-----|--------------------|---------|
| **grant-sync** | 6:00 UTC | Sync grants from JSON feed, Grants.gov, UK, EU sources |
| **grant-discovery** | 6:30 UTC | Multi-agent discovery (Claude + optional OpenAI/Gemini) for orgs with profile ≥ 30% |
| **grant-scanner** | 7:00 UTC | Match grants to profiles (Claude), send `grant_match` |
| **eligibility-refresh** | 7:30 UTC | Score grants per profile, upsert `EligibilityAssessment`, send digest and high-match (`grant_match_high`) with start-application tokens |
| **deadline-reminder** | Hourly | At 9am local (org timezone), send reminders for 7/3/1 day deadlines; include start-application link when token present |
| **monitor-session** | Event `app/session.started` | Poll worker session status, update Application, send review_required when done |
| **grant-source-crawler** | Every 6h | Crawl grant source registry |
| **grant-form-url-scout** | 2:00 UTC | Enqueue grants for form URL discovery |
| **grant-discovery-enqueue** | Every 12h ( :30 ) | Enqueue orgs for discovery |
| **grant-discovery-process** | Every 12h | Process grant discovery queue |

Cron endpoints: e.g. `/api/cron/grant-sync`, `/api/cron/grant-discovery`. Inngest route: `/api/inngest`.

---

## 12. Billing and plans

- **Plans:** FREE_TRIAL, PRO, BUSINESS (see `lib/stripe.ts`).
- **Limits (summary):**  
  - **FREE_TRIAL:** 1 profile, 5 matches/month, 1 auto-fill/month, 7-day trial.  
  - **PRO:** 1 profile, unlimited matches, 10 auto-fills/month.  
  - **BUSINESS:** 5 profiles, unlimited matches, unlimited auto-fills.
- **Usage:** `checkUsageLimit(orgId, "autofill" | "match")` and `recordUsage(orgId, type)` in `lib/plan-check.ts`; Usage table stores monthly usage.
- **Stripe:** Checkout for subscribe/upgrade, webhook for subscription events, sync of plan to `Organisation.plan` via `billing/sync` and `webhooks/stripe`.

---

## 13. Intelligence page

- Explains: structured form intelligence (parse grant forms, map profile to fields, detect attachments), portal submission automation (one flow: open portal, fill, upload, review, submit), eligibility scoring and improvement, grant knowledge (funder/sector/amount, AI matching).
- Shows last filled snapshot stats (field count, file count) if any.
- **Eligibility notification preferences:** Toggle eligibility digest (e.g. grant_scan_digest) per org (email/WhatsApp).
- Links to Applications and Grants.

---

## 14. Admin

- **Route:** `/admin` (protected; typically restricted to admin users).
- **Actions:** Grant import (file + API), test notification (send a notification type for testing).

---

## 15. API routes (summary)

- **Health:** `GET /api/health` → `{ "status": "ok" }`.
- **Applications:** start, start-by-token, start-with-link, start-check, approve, submit; [id]: snapshot, cancel, delete, save-to-profile.
- **Grants:** discover, eligibility-scores, [id], [id]/eligibility, [id]/parse-requirements, [id]/scout-form-link, [id]/auto-improve, saved, match.
- **Profile:** documents/upload, funding-strategy, eligibility-preferences, notification-channels.
- **Billing:** checkout, sync. **Webhooks:** stripe.
- **Cron:** grant-sync, grant-discovery.
- **Inngest:** `POST /api/inngest` — Inngest endpoint.
- **Internal:** e.g. merge-grant-memory. **Admin:** test-notification, grants/import, grants/import-file.

---

## 16. Worker (grantpilot-worker)

- **Role:** Picks up running `cu_sessions`, executes `cu_session_items` with Playwright and Claude (navigate grant URL, fill company/financial fields, upload documents, prepare review; optionally submit).
- **Loop:** Polls Supabase every 5s for sessions with status `running`.
- **Env:** Same Supabase + Anthropic keys as needed for API and Inngest. Run from `grantpilot-worker/` with its own `.env`.

---

## 17. Data model (high level)

- **User:** id, supabaseId, email, phoneNumber, whatsappOptIn, etc.
- **Organisation:** name, type, plan, stripeId, preferredTimezone.
- **OrganisationMember:** userId, organisationId, role (OWNER, ADMIN, MEMBER, VIEWER).
- **BusinessProfile:** organisationId, business details, funding range, funderLocations, completionScore, documents (Document).
- **Grant:** name, funder, amount, deadline, applicationUrl, eligibility, description, sectors, regions, source, externalId.
- **Application:** organisationId, grantId, profileId, status, submittedAt.
- **EligibilityAssessment:** organisation_id, profile_id, grant_id, score, summary (from eligibility-refresh).
- **Usage:** organisationId, type (e.g. autofill, match), units (for plan limits).
- **NotificationLog:** userId, channel, type, status, error.
- **cu_sessions / cu_session_items:** Worker execution state (session + items like open_grant_url, fill_company_details, etc.).

Supabase migrations in `supabase/migrations/` define the actual schema (including RLS and any extra tables).

---

## 18. Environment and run order

- **Required env (main app):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY`. Optional: Stripe, Resend, Twilio, OpenAI, Gemini keys for full functionality.
- **Full local stack:**  
  1. `npm run dev` (Next.js).  
  2. `cd grantpilot-worker && npm run dev` (worker).  
  3. `npx inngest-cli@latest dev` (optional; for Inngest cron and events).

This overview should be enough to understand all main features, actions, and how the app works end to end.
