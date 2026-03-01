# GrantPilot – Production Deployment

## 1. Environment variables

Set these in your host (Vercel, Railway, etc.) or in production `.env`:

| Variable | Required | Notes |
|----------|----------|--------|
| `ANTHROPIC_API_KEY` | Yes | Grant matching (Claude) |
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

## 2. Storage (profile documents)

- In Supabase Dashboard → **Storage**, create a bucket named **`documents`** (public if you want direct links, or private and use signed URLs later). Profile document uploads use this bucket via the service role key.

## 3. Database

- **Supabase**: Ensure all migrations are applied. Run the SQL in `supabase/migrations/` (e.g. `001_business_profile_funding_columns.sql`) in the Supabase SQL Editor if not already applied.
- **Prisma**: No `prisma db push` in production from the app. Schema changes should be applied via SQL or migrations before deploy. `npm run build` runs `prisma generate` so the client matches your DB.

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

- In Stripe Dashboard, set the webhook URL to `https://<your-domain>/api/webhooks/stripe` and set `STRIPE_WEBHOOK_SECRET` in env.
