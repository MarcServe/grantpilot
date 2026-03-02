# GrantPilot – Production Deployment

## Production readiness checklist (before real customers)

Before going live with customers, ensure:

| Item | Notes |
|------|--------|
| **Env vars** | All required variables set on the host (see §1). **`NEXT_PUBLIC_APP_URL`** must be your production URL (e.g. `https://grantpilot.co.uk`) or Stripe checkout and email links will point to the wrong place. |
| **Supabase** | All migrations applied (001–012). Storage bucket **`documents`** created. RLS applied if you use authenticated Supabase clients. |
| **Auth** | Supabase Auth (or your IdP) configured with production redirect URLs. Sign-in/sign-up and dashboard protection are in place. |
| **Grant data** | Either set **`GRANTS_FEED_URL`** for daily sync or import grants via **POST /api/admin/grants/import** (header **`x-grants-import-secret`**). Without grants, the app has nothing to match or display. |
| **Inngest** | App registered in [Inngest Cloud](https://app.inngest.com) with production serve URL; **INNGEST_EVENT_KEY** and **INNGEST_SIGNING_KEY** set. Needed for grant-sync, discovery, deadline reminders, eligibility refresh. |
| **Email** | **RESEND_API_KEY** and **EMAIL_FROM** set so transactional emails (welcome, reminders, digests) are sent. |
| **WhatsApp** (optional) | **TWILIO_*** set and users can add a number + opt-in on Profile; otherwise email-only. |
| **Billing** (optional) | **STRIPE_*** and webhook URL configured if you use paid plans. |
| **Secrets** | **GRANTS_IMPORT_SECRET** set and kept secret if you use the admin import API. **APPROVE_LINK_SECRET** / **START_APPLICATION_LINK_SECRET** optional; fallback to Inngest signing key. |

The app is structured for production: auth-protected dashboard, org-scoped data, RLS-ready schema, server-side API keys, and health check at **GET /api/health**. Run through sign-up → profile → grants → apply once on staging with real env vars before cutting over.

---

## 1. Environment variables

Set these in your host (Vercel, Railway, etc.) or in production `.env`:

| Variable | Required | Notes |
|----------|----------|--------|
| `ANTHROPIC_API_KEY` | Yes | Grant matching and eligibility (Claude) |
| `OPENAI_API_KEY` | Optional | For multi-agent grant discovery (when implemented) |
| `GEMINI_API_KEY` | Optional | For multi-agent grant discovery (when implemented); or `GOOGLE_AI_API_KEY` |
| `DATABASE_URL` | Yes | Supabase Postgres; use pooler: `...:6543/postgres?pgbouncer=true` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Yes | For admin operations (e.g. worker) |
| `NEXT_PUBLIC_APP_URL` | Yes | Production app URL (e.g. `https://grantpilot.co.uk`) |
| `INNGEST_EVENT_KEY` | Yes* | From [Inngest Cloud](https://app.inngest.com) after app sync |
| `INNGEST_SIGNING_KEY` | Yes* | From Inngest Cloud (secure serve) |
| `STRIPE_*` | Billing | If using paid plans |
| `RESEND_API_KEY` | Emails | For transactional email |
| `TWILIO_*` | WhatsApp | For WhatsApp notifications |

\* Inngest: use [Vercel integration](https://inngest.com/docs/deploy/vercel) to auto-set keys and sync.

### Multi-agent grant discovery (optional)

Claude, OpenAI, and Gemini discovery modules run from **“Find grants”** and from the **grant-discovery** Inngest job. Set **`OPENAI_API_KEY`** and **`GEMINI_API_KEY`** (or **`GOOGLE_AI_API_KEY`**) in production if you want those sources; Claude uses **`ANTHROPIC_API_KEY`** (required).

## 2. Storage (profile documents)

- In Supabase Dashboard → **Storage**, create a bucket named **`documents`** (public if you want direct links, or private and use signed URLs later). Profile document uploads use this bucket via the service role key.

## 3. Database

- **Supabase**: Ensure all migrations are applied. Run the SQL in `supabase/migrations/` (e.g. `001_business_profile_funding_columns.sql`) in the Supabase SQL Editor if not already applied.
- **Prisma**: No `prisma db push` in production from the app. Schema changes should be applied via SQL or migrations before deploy. `npm run build` runs `prisma generate` so the client matches your DB.

### Phase 2: RLS (Row Level Security)

Migration **`008_rls_hardening.sql`** enables RLS on all multi-tenant and user-scoped tables. It enforces tenant and user isolation at the database layer when requests use the **authenticated** role (user JWT). The **service role** (used by the Next.js app and worker) bypasses RLS, so existing behaviour is unchanged. Apply this migration in the Supabase SQL Editor after other migrations to harden access control.

### Daily ingest and notification time (timezone)

- **Grant discovery** runs **daily** at 4am UTC (`grant-discovery` Inngest function).
- **Deadline reminders** run **every hour**. For each organisation, reminders are sent only when it is **9am in that org’s timezone** (so users get a morning notification in their local time). Apply **`012_organisation_timezone.sql`** to add `Organisation.preferredTimezone` (IANA, e.g. `Europe/London`). Users set it under **Billing → Notification time**; if unset, UTC is used.

## 4. Build and run

```bash
npm ci
npm run build
npm start
```

- **Vercel**: Connect repo; set env vars; deploy. Use **Inngest Vercel integration** so the app syncs and Inngest keys are set automatically.
- **Docker**: Uncomment `output: "standalone"` in `next.config.ts`, then build the image and run with `node .next/standalone/server.js` (see Next.js standalone docs).

## 5. Real grant data (production)

### Option A: JSON feed (recommended)

1. **Run the Grant migration**  
   In Supabase SQL Editor, run the SQL in **`supabase/migrations/002_grant_external_id.sql`** (adds `externalId` for feed upserts).

2. **Host your feed**  
   The feed is a single URL that returns a JSON array of grants. You can:
   - **Use this repo’s sample:** Copy **`public/grants-feed.sample.json`** to **`public/grants-feed.json`**, replace with your real data, then deploy. Next.js serves `public/` as static files, so the feed URL will be **`https://<your-domain>/grants-feed.json`**.
   - Or host the same JSON anywhere else (S3, CMS, Airtable export URL, your own API).

3. **Set the env var**  
   In your host (Vercel, etc.) set:
   ```bash
   GRANTS_FEED_URL=https://<your-domain>/grants-feed.json
   ```
   (Use your actual feed URL.)

4. **Sync**  
   The **grant-sync** Inngest function runs **daily at 03:00** and fetches this URL, then creates or updates grants by `externalId`. To run a sync immediately without waiting for cron, call **`POST /api/admin/grants/import`** with header **`x-grants-import-secret: <GRANTS_IMPORT_SECRET>`** and body **`{ "syncFeed": true }`**.

Feed format: each object must have **`name`**, **`funder`**, **`applicationUrl`**, **`eligibility`**. Optional: **`amount`**, **`deadline`** (ISO date, e.g. `2026-06-30`), **`sectors`** (array of strings), **`regions`** (array), **`externalId`** (unique string for upserts). See **`public/grants-feed.sample.json`** for an example.

- **Manual / CI import**  
  Call **`POST /api/admin/grants/import`** with:
  - Header: **`x-grants-import-secret: <GRANTS_IMPORT_SECRET>`**
  - Body: JSON array of grant objects (same shape as above), or **`{ "syncFeed": true }`** to run the feed sync once.  
  Use this to bulk-import from a spreadsheet (e.g. export JSON from Airtable/Sheets) or to trigger a one-off feed sync.

- **Feed format example**  
  Host a JSON file (e.g. on your site or S3) or point to an API that returns:
  ```json
  [
    {
      "externalId": "gov-uk-123",
      "name": "Innovate UK Smart Grants",
      "funder": "Innovate UK",
      "amount": 500000,
      "deadline": "2026-06-30",
      "applicationUrl": "https://...",
      "eligibility": "UK registered businesses...",
      "sectors": ["Technology", "Healthcare"],
      "regions": ["England", "Wales"]
    }
  ]
  ```

Apply the **Grant schema change** (add `externalId` column) in Supabase SQL Editor if not using Prisma migrations:  
`ALTER TABLE "Grant" ADD COLUMN IF NOT EXISTS "externalId" TEXT UNIQUE;`

## 6. Inngest (background jobs)

- **With Vercel**: Install [Inngest for Vercel](https://inngest.com/docs/deploy/vercel); each deploy syncs your app and sets `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
- **Without Vercel**: In [Inngest Cloud](https://app.inngest.com), add an app with serve URL `https://<your-domain>/api/inngest`. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in your host env.

Functions (grant scanner, **grant-sync** from feed, deadline reminders, session monitor) run in Inngest Cloud; they call your app and use `ANTHROPIC_API_KEY` and `DATABASE_URL` from the deploy environment.

## 7. Health check

- **Endpoint**: `GET /api/health` → `200 { "status": "ok" }`.
- Use for load balancers, k8s readiness, or uptime checks.

## 8. Stripe webhooks (if using billing)

**Endpoint:** `https://<your-domain>/api/webhooks/stripe`  
**Env:** set `STRIPE_WEBHOOK_SECRET` to the signing secret Stripe shows after adding the endpoint.

**Payload style:** Use **Snapshot** (full) payloads. Our handler reads full objects from `event.data.object` (e.g. `session.metadata`, `subscription.items.data`). Thin payloads only send IDs and would require fetching each object via the API; we do not support thin payloads. When adding the destination in Stripe, choose the option that delivers full event payloads (snapshot style).

**Events to send to this endpoint:**

| Event | Purpose |
|-------|--------|
| `checkout.session.completed` | Set organisation plan from completed checkout (customer + metadata.priceId). |
| `customer.subscription.updated` | Update plan when subscription changes (e.g. upgrade/downgrade). |
| `customer.subscription.deleted` | Set plan back to `FREE_TRIAL` when subscription ends. |

If you use multiple payload styles in Stripe (e.g. one destination for snapshot, one for thin), point **this** webhook URL only at the **snapshot** destination. Event handling differs between styles; our code is written for snapshot only.
