# Grants-Copilot (GrantPilot)

AI-powered grant discovery, matching, and application preparation platform. Version 1 helps founders and SMEs find fresh grants, understand eligibility, receive alerts, and prepare funder-ready documents. External form auto-filing remains a Version 2 workflow while dynamic form handling is hardened.

**Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Supabase (Postgres, Auth, Storage). Optional worker: `grantpilot-worker/` for Playwright-based form filling.

---

## Getting started

### Prerequisites

- Node.js 18+
- npm

### 1. Install and run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 2. Environment variables

Create a `.env` file (or use `.env.local`). Required for the app to run:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `NEXT_PUBLIC_APP_URL` | App URL (e.g. `http://localhost:3000`) |
| `OPENAI_API_KEY` | For app AI features: discovery, matching, eligibility, website intelligence, requirements parsing, and profile autofill |

Optional: `RESEND_API_KEY`, `EMAIL_FROM`, Stripe keys, Twilio (WhatsApp). See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full list.

**Note:** The app uses **Supabase** for all database access. There is no Prisma at runtime and no `DATABASE_URL`; the Prisma schema is for documentation only.

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (port 3000) |
| `npm run build` | Production build (`next build`) |
| `npm start` | Start production server |
| `npx eslint .` | Lint (or `npm run lint`) |

**Health check:** `GET /api/health` returns `{"status":"ok"}`.

---

## Optional: full system

- **Worker** (V2/internal form filling): `cd grantpilot-worker && npm install && npm run dev`  
  Needs its own `.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and any legacy vision fallback provider keys still enabled.

- **Inngest** (cron jobs: grant sync, scanner, eligibility refresh, reminders):  
  `npx inngest-cli@latest dev`  
  Required in production for grant matching, digest emails, and deadline reminders.

---

## Docs

- **[AGENTS.md](./AGENTS.md)** — Cursor/agent instructions, services, architecture, Inngest jobs, notifications.
- **[APP_OVERVIEW.md](./APP_OVERVIEW.md)** — Features, routes, user flows, and V2 auto-filing internals.
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Env vars, hosting (e.g. Vercel), Inngest, migrations.

---

## Deploy

- **Build:** `npm run build`
- **Run:** `npm start`
- **Hosting:** Vercel (or similar). Add the [Inngest integration](https://inngest.com/docs/deploy/vercel) so background jobs run in production.
- **Database:** Run Supabase migrations (`supabase/migrations/`) against your project.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for details.
