# Direct Grant Form Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GrantsCopilot only present a grant as “Apply” / “Suggested” when the grant is confirmed current and the app has a verified direct application form or a clearly labelled official application portal, while preserving grant detail pages for research.

**Architecture:** Put a freshness gate before the link-quality gate. Existing and newly ingested grants must be marked current before they can be Suggested, emailed, or sent by WhatsApp. Then split today’s overloaded `Grant.applicationUrl` into two meanings: the official grant/detail URL and the confirmed application/start URL. Add URL-quality classification at ingestion, Scout resolution, existing-grant backfill, match filtering, and UI labels so expired pages, generic landing pages, historic pages, and list pages cannot look like ready-to-apply opportunities.

**Tech Stack:** Next.js 16 app router, Supabase Postgres, TypeScript, Playwright worker, existing `tsx` script tests.

---

## Current Findings

- `Grant.applicationUrl` is used for direct forms, grant detail pages, funder listing pages, generic business support pages, and login/account creation pages.
- `lib/grant-url-validation.ts` rejects only obvious one-segment generic paths. It still allows specific-but-expired pages such as old Nesta programme pages.
- `grantpilot-worker/src/scout.ts` can mark a link `found` even if the final URL is not actually form-like. Some branches return a regex/Gemini candidate without requiring a direct form or official portal proof.
- `app/api/grants/eligible-matches/route.ts` filters by `isGrantActionableNow`, but “actionable” currently means not dead/expired, not “has a direct application/start link”.
- The existing freshness code can catch old deadlines when the date is stored on the grant or when URL health has already been run and persisted. It does not protect old/backfilled rows whose `url_status` is still `unknown` and whose 2019 deadline only appears on the remote page.
- The opportunity list should not perform live page fetches at render time. Expired/dead URL discovery must happen in ingestion, Scout, scheduled audits, and admin review, then the list reads persisted status instantly.
- The grant detail page has “Find application form”, but the suggested list and “Prepare Application” flow do not require that discovery to have succeeded first.

## File Structure

- `supabase/migrations/058_grant_application_url_quality.sql`: add URL-quality fields and indexes.
- `prisma/schema.prisma`: mirror new `Grant` columns for local schema clarity.
- `lib/grant-application-url-quality.ts`: pure URL/text/DOM classification helpers shared by ingestion and app APIs.
- `scripts/test-grant-application-url-quality.ts`: deterministic tests for the examples in the screenshots and known direct form hosts.
- `scripts/test-grant-actionability.ts`: add a regression for the 2019 CareerTech page text so expired grants cannot re-enter Suggested.
- `scripts/audit-expired-grants.ts`: live-check existing grants with unknown/no deadline status and persist expired/dead outcomes before users see them.
- `lib/grants-ingest.ts`: preserve official detail URL, classify incoming URLs, enqueue Scout for non-direct candidates, reject generic/closed URLs.
- `lib/grants-ai-extract.ts` and discovery provider prompts: request both `detailUrl` and `directApplicationUrl` when available, without forcing models to invent direct forms.
- `grantpilot-worker/src/scout.ts`: only update `Grant.directApplicationUrl` when the final page is verified as a direct form or official portal start.
- `app/api/grants/eligible-matches/route.ts`: keep “Suggested” actionable by filtering or demoting unresolved/generic link candidates.
- `components/grants/eligible-grant-card.tsx`, `components/grants/apply-button.tsx`, `app/(dashboard)/grants/[id]/page.tsx`: label link quality and block “Open funder form” when the direct/start link is missing.
- `app/api/admin/review-queue/route.ts` and `components/admin/review-queue-actions.tsx`: admin approval writes the direct application URL and quality metadata.
- `scripts/audit-grant-application-links.ts`: backfill existing grants, enqueue Scout, and quarantine known bad links.

---

### Task 1: Add URL-Quality Data Model

**Files:**
- Create: `supabase/migrations/058_grant_application_url_quality.sql`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/058_grant_application_url_quality.sql
ALTER TABLE "Grant"
  ADD COLUMN IF NOT EXISTS "detailUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "directApplicationUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "applicationUrlKind" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "applicationUrlQuality" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "applicationUrlConfidence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "applicationUrlVerifiedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "applicationUrlQualityReason" TEXT;

UPDATE "Grant"
SET "detailUrl" = COALESCE("detailUrl", "applicationUrl")
WHERE "detailUrl" IS NULL AND "applicationUrl" IS NOT NULL;

ALTER TABLE "Grant"
  DROP CONSTRAINT IF EXISTS grant_application_url_kind_check,
  ADD CONSTRAINT grant_application_url_kind_check
    CHECK ("applicationUrlKind" IN (
      'direct_form',
      'portal_application',
      'specific_grant_page',
      'generic_listing',
      'account_registration',
      'closed_or_expired',
      'dead_link',
      'unknown'
    ));

ALTER TABLE "Grant"
  DROP CONSTRAINT IF EXISTS grant_application_url_quality_check,
  ADD CONSTRAINT grant_application_url_quality_check
    CHECK ("applicationUrlQuality" IN (
      'verified_direct',
      'verified_portal',
      'needs_scout',
      'manual_review',
      'rejected',
      'unknown'
    ));

CREATE INDEX IF NOT EXISTS "Grant_applicationUrlQuality_idx"
  ON "Grant"("applicationUrlQuality");

CREATE INDEX IF NOT EXISTS "Grant_applicationUrlKind_idx"
  ON "Grant"("applicationUrlKind");
```

- [ ] **Step 2: Update Prisma schema**

Add these fields inside `model Grant` in `prisma/schema.prisma` after `applicationUrl`:

```prisma
  detailUrl                    String?
  directApplicationUrl          String?
  applicationUrlKind            String   @default("unknown")
  applicationUrlQuality         String   @default("unknown")
  applicationUrlConfidence      Int      @default(0)
  applicationUrlVerifiedAt      DateTime?
  applicationUrlQualityReason   String?
```

- [ ] **Step 3: Commit the schema change**

Run:

```bash
git add supabase/migrations/058_grant_application_url_quality.sql prisma/schema.prisma
git commit -m "Add grant application URL quality fields"
```

Expected: commit succeeds with only migration/schema files.

---

### Task 2: Build Deterministic URL Classifier

**Files:**
- Create: `lib/grant-application-url-quality.ts`
- Create: `scripts/test-grant-application-url-quality.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the failing test**

```ts
// scripts/test-grant-application-url-quality.ts
import assert from "node:assert/strict";
import {
  classifyGrantApplicationUrl,
  classifyGrantPageText,
  shouldExposeApplyCta,
} from "../lib/grant-application-url-quality";

assert.equal(
  classifyGrantApplicationUrl("https://forms.gle/abc123").kind,
  "direct_form",
  "Google Forms links should be direct forms"
);

assert.equal(
  classifyGrantApplicationUrl("https://airtable.com/app123/shr456").quality,
  "verified_direct",
  "Airtable form links should be verified direct"
);

assert.equal(
  classifyGrantApplicationUrl("https://www.bristol.gov.uk/business-support-advice").kind,
  "generic_listing",
  "Bristol business support landing page should not be treated as an application form"
);

assert.equal(
  classifyGrantPageText({
    url: "https://www.nesta.org.uk/project/careertech-challenge/",
    title: "CareerTech Challenge Fund",
    bodyText: "Apply to the CareerTech Challenge Fund by 2pm 9th December 2019. Applications close 9th Dec 2019.",
    now: new Date("2026-06-24T12:00:00Z"),
  }).kind,
  "closed_or_expired",
  "Historic application deadline text should mark the opportunity closed"
);

assert.equal(
  classifyGrantPageText({
    url: "https://apply.startuploans.co.uk/thank-you",
    title: "Thank you",
    bodyText: "Your Start Up Loans account has been successfully created and we have emailed you a link to activate your account.",
    now: new Date("2026-06-24T12:00:00Z"),
  }).kind,
  "account_registration",
  "Account-created confirmation pages should not be sold as direct grant forms"
);

assert.equal(shouldExposeApplyCta({ quality: "verified_direct" }), true);
assert.equal(shouldExposeApplyCta({ quality: "verified_portal" }), true);
assert.equal(shouldExposeApplyCta({ quality: "needs_scout" }), false);
assert.equal(shouldExposeApplyCta({ quality: "rejected" }), false);

console.log("grant application URL quality tests passed");
```

- [ ] **Step 2: Wire the test command**

Add this to `package.json` scripts:

```json
"test:grant-url-quality": "tsx scripts/test-grant-application-url-quality.ts"
```

- [ ] **Step 3: Run the test and confirm it fails**

Run:

```bash
npm run test:grant-url-quality
```

Expected: FAIL because `lib/grant-application-url-quality.ts` does not exist yet.

- [ ] **Step 4: Implement the classifier**

```ts
// lib/grant-application-url-quality.ts
export type ApplicationUrlKind =
  | "direct_form"
  | "portal_application"
  | "specific_grant_page"
  | "generic_listing"
  | "account_registration"
  | "closed_or_expired"
  | "dead_link"
  | "unknown";

export type ApplicationUrlQuality =
  | "verified_direct"
  | "verified_portal"
  | "needs_scout"
  | "manual_review"
  | "rejected"
  | "unknown";

export type ApplicationUrlClassification = {
  kind: ApplicationUrlKind;
  quality: ApplicationUrlQuality;
  confidence: number;
  reason: string;
};

const FORM_HOST_PATTERNS = [
  /(^|\.)airtable\.com$/i,
  /(^|\.)typeform\.com$/i,
  /^forms\.gle$/i,
  /^docs\.google\.com$/i,
  /(^|\.)jotform\.com$/i,
  /(^|\.)submittable\.com$/i,
  /(^|\.)smartsheet\.com$/i,
  /(^|\.)formstack\.com$/i,
  /(^|\.)cognitoforms\.com$/i,
];

const GENERIC_PATH_SEGMENTS = new Set([
  "business-support-advice",
  "information-for-businesses",
  "for-business",
  "for-businesses",
  "grants",
  "funding",
  "opportunities",
  "schemes",
  "support",
  "advice",
  "search",
]);

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function classifyGrantApplicationUrl(rawUrl: string): ApplicationUrlClassification {
  const url = safeUrl(rawUrl);
  if (!url) {
    return { kind: "dead_link", quality: "rejected", confidence: 100, reason: "Invalid URL" };
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase().replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);

  if (FORM_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return { kind: "direct_form", quality: "verified_direct", confidence: 95, reason: "Known hosted form provider" };
  }

  if (host.includes("apply-for-innovation-funding.service.gov.uk")) {
    return { kind: "portal_application", quality: "verified_portal", confidence: 90, reason: "Known official application portal" };
  }

  if (/^apply\./i.test(host) || path.includes("/apply") || path.includes("/application")) {
    return { kind: "portal_application", quality: "verified_portal", confidence: 75, reason: "Apply/application URL pattern" };
  }

  if (segments.length <= 1 && GENERIC_PATH_SEGMENTS.has(segments[0] ?? "")) {
    return { kind: "generic_listing", quality: "rejected", confidence: 90, reason: "Generic funder/listing page" };
  }

  if (segments.some((segment) => GENERIC_PATH_SEGMENTS.has(segment)) && segments.length <= 2) {
    return { kind: "generic_listing", quality: "manual_review", confidence: 70, reason: "Likely listing page, not a specific form" };
  }

  return { kind: "specific_grant_page", quality: "needs_scout", confidence: 55, reason: "Specific grant/detail page needs direct form discovery" };
}

export function classifyGrantPageText(input: {
  url: string;
  title?: string | null;
  bodyText: string;
  now?: Date;
}): ApplicationUrlClassification {
  const base = classifyGrantApplicationUrl(input.url);
  const text = `${input.title ?? ""} ${input.bodyText}`.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const now = input.now ?? new Date();

  if (/account has been successfully created|activate your account|confirmation email/i.test(text)) {
    return { kind: "account_registration", quality: "manual_review", confidence: 90, reason: "Account creation/activation step, not a grant application form" };
  }

  const dateMatches = [...text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/gi)];
  const monthIndex: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  for (const match of dateMatches) {
    const day = Number(match[1]);
    const month = monthIndex[match[2].toLowerCase()];
    const year = Number(match[3]);
    const date = new Date(year, month, day);
    const window = lower.slice(Math.max(0, (match.index ?? 0) - 80), (match.index ?? 0) + 120);
    const deadlineSignal = /apply by|applications? close|deadline|submit by|closing date/.test(window);
    if (deadlineSignal && date.getTime() < now.getTime()) {
      return { kind: "closed_or_expired", quality: "rejected", confidence: 95, reason: `Past application deadline detected: ${match[0]}` };
    }
  }

  if (/applications? (are|is|have|has) (now )?(closed|ended)|no longer accepting|deadline has passed/i.test(text)) {
    return { kind: "closed_or_expired", quality: "rejected", confidence: 90, reason: "Closed/expired wording detected" };
  }

  return base;
}

export function shouldExposeApplyCta(input: { quality?: string | null }): boolean {
  return input.quality === "verified_direct" || input.quality === "verified_portal";
}
```

- [ ] **Step 5: Run the test and commit**

Run:

```bash
npm run test:grant-url-quality
git add lib/grant-application-url-quality.ts scripts/test-grant-application-url-quality.ts package.json
git commit -m "Add grant application URL quality classifier"
```

Expected: test prints `grant application URL quality tests passed`.

---

### Task 2A: Make Expired Grants a First-Class Gate

**Files:**
- Modify: `scripts/test-grant-actionability.ts`
- Create: `scripts/audit-expired-grants.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the 2019 CareerTech regression**

In `scripts/test-grant-actionability.ts`, add a regression that uses the same failure shape from the screenshot:

```ts
assert.equal(
  freshness({
    name: "CareerTech Challenge Fund",
    eligibility:
      "Apply to the CareerTech Challenge Fund by 2pm 9th December 2019. Shortlisted applicants will be informed in January 2020 and successful applicants in late February 2020.",
  }).usable,
  false,
  "2019 CareerTech application window should be stale"
);
```

Run:

```bash
npm run test:grant-actionability
```

Expected: the test passes once the existing freshness parser sees the past application deadline. If it fails, fix `lib/grant-freshness.ts` before touching list filtering.

- [ ] **Step 2: Add an expired-grant audit script**

Create `scripts/audit-expired-grants.ts` to live-check existing grants whose persisted status is still unknown or missing. It must not run inside the opportunities page request path.

```ts
// scripts/audit-expired-grants.ts
import { getGrantFreshnessStatus } from "../lib/grant-freshness";
import { getSupabaseAdmin } from "../lib/supabase";
import { checkUrlHealth } from "../lib/url-health-check";

const supabase = getSupabaseAdmin();

async function main() {
  const limit = Number(process.env.GRANT_AUDIT_LIMIT ?? 1000);
  const { data: grants, error } = await supabase
    .from("Grant")
    .select("id,name,funder,deadline,applicationUrl,eligibility,description,objectives,url_status")
    .not("applicationUrl", "is", null)
    .not("url_status", "in", "(dead,expired)")
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  let expired = 0;
  let dead = 0;
  let checked = 0;

  for (const grant of grants ?? []) {
    const storedFreshness = getGrantFreshnessStatus(grant);
    const result = storedFreshness.usable
      ? await checkUrlHealth(String(grant.applicationUrl), grant)
      : { status: "expired" as const, reason: storedFreshness.message ?? "Stored grant deadline is stale" };

    checked++;
    if (result.status !== "expired" && result.status !== "dead") continue;

    await supabase
      .from("Grant")
      .update({
        url_status: result.status,
        url_checked_at: new Date().toISOString(),
      })
      .eq("id", grant.id);

    if (result.status === "expired") expired++;
    if (result.status === "dead") dead++;
  }

  console.log({ checked, expired, dead });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: Add the package script**

```json
"audit:expired-grants": "tsx scripts/audit-expired-grants.ts"
```

- [ ] **Step 4: Run the audit before link-quality backfill**

Run in staging/local first:

```bash
GRANT_AUDIT_LIMIT=500 npm run audit:expired-grants
```

Expected: old pages such as the Nesta 2019 CareerTech page are persisted with `url_status = expired`, so they disappear from Suggested, email, and WhatsApp without needing a user to open the page.

- [ ] **Step 5: Make every notification/list source rely on persisted freshness**

Before applying the direct-link gate, confirm these paths already exclude `url_status IN ('dead', 'expired')` through `isGrantActionableNow` or equivalent. Patch any gap found:

```text
app/api/grants/eligible-matches/route.ts
daily email digest generation
WhatsApp digest generation
dashboard suggestion queries
admin diagnostics counts
```

- [ ] **Step 6: Commit**

```bash
git add scripts/test-grant-actionability.ts scripts/audit-expired-grants.ts package.json
git commit -m "Audit and quarantine expired grant links"
```

---

### Task 3: Classify and Preserve URLs During Ingestion

**Files:**
- Modify: `lib/grants-ingest.ts`
- Modify: `lib/grants-ai-extract.ts`
- Modify: `lib/grants-discovery-types.ts`
- Modify: `lib/grants-discovery-openai.ts`
- Modify: `lib/grants-discovery-claude.ts`
- Modify: `lib/grants-discovery-perplexity.ts`

- [ ] **Step 1: Extend `GrantInput`**

In `lib/grants-ingest.ts`, update `GrantInput`:

```ts
  /** Official grant detail page, even if the form is elsewhere. */
  detailUrl?: string | null;
  /** Confirmed direct form or official portal start URL. */
  directApplicationUrl?: string | null;
```

- [ ] **Step 2: Classify rows before upsert**

In `upsertGrant`, before `const sectors = ...`, add:

```ts
  const detailUrl = input.detailUrl?.trim() || input.applicationUrl.trim();
  const directCandidate = input.directApplicationUrl?.trim() || input.applicationUrl.trim();
  const directClassification = classifyGrantApplicationUrl(directCandidate);
  const detailClassification = classifyGrantApplicationUrl(detailUrl);

  if (directClassification.quality === "rejected" && detailClassification.quality === "rejected") {
    throw new Error(`Grant URL is not actionable: ${directClassification.reason}`);
  }

  const directApplicationUrl =
    directClassification.quality === "verified_direct" || directClassification.quality === "verified_portal"
      ? directCandidate
      : null;
```

Import:

```ts
import { classifyGrantApplicationUrl } from "@/lib/grant-application-url-quality";
```

- [ ] **Step 3: Write URL-quality fields to `Grant`**

Update the `data` object:

```ts
    applicationUrl: directApplicationUrl ?? detailUrl,
    detailUrl,
    directApplicationUrl,
    applicationUrlKind: directApplicationUrl ? directClassification.kind : detailClassification.kind,
    applicationUrlQuality: directApplicationUrl ? directClassification.quality : detailClassification.quality,
    applicationUrlConfidence: directApplicationUrl ? directClassification.confidence : detailClassification.confidence,
    applicationUrlVerifiedAt: directApplicationUrl ? new Date().toISOString() : null,
    applicationUrlQualityReason: directApplicationUrl ? directClassification.reason : detailClassification.reason,
```

- [ ] **Step 4: Only Scout unresolved specific pages**

Replace existing enqueue calls:

```ts
  if (!directApplicationUrl && detailClassification.quality === "needs_scout") {
    await enqueueGrantForScoutIfProgrammeUrl(grant.id).catch(() => {});
  }
```

- [ ] **Step 5: Update extraction prompts**

In `lib/grants-ai-extract.ts`, replace the `application_link` bullet in `EXTRACT_SYSTEM` with:

```ts
- detail_link (string): official grant/detail page URL for this specific grant
- direct_application_link (string or null): direct form or official portal start URL only when clearly present; otherwise null
```

Then map output:

```ts
const detailUrl =
  typeof o.detail_link === "string" && o.detail_link.trim()
    ? o.detail_link.trim()
    : applicationUrl || pageUrl;
const directApplicationUrl =
  typeof o.direct_application_link === "string" && o.direct_application_link.trim()
    ? o.direct_application_link.trim()
    : null;
```

And return:

```ts
applicationUrl: directApplicationUrl || detailUrl,
detailUrl,
directApplicationUrl,
```

- [ ] **Step 6: Update web-search provider prompts**

In each provider prompt, replace “applicationUrl” instructions with:

```text
- detailUrl: official page for this exact grant/opportunity.
- directApplicationUrl: direct application form or official portal start URL only if the page exposes one. Use null if not visible.
- applicationUrl: set to directApplicationUrl when present; otherwise set to detailUrl.
Do not invent directApplicationUrl. Do not use generic landing pages such as council business support hubs.
```

- [ ] **Step 7: Verify ingestion**

Run:

```bash
npm run test:grant-url-quality
npm run build
```

Expected: classifier tests pass and build completes.

- [ ] **Step 8: Commit**

```bash
git add lib/grants-ingest.ts lib/grants-ai-extract.ts lib/grants-discovery-types.ts lib/grants-discovery-openai.ts lib/grants-discovery-claude.ts lib/grants-discovery-perplexity.ts
git commit -m "Classify grant application URLs during ingestion"
```

---

### Task 4: Make Scout Strict About Direct Forms

**Files:**
- Modify: `grantpilot-worker/src/scout.ts`
- Modify: `supabase/migrations/058_grant_application_url_quality.sql` if additional queue metadata is needed before migration is applied

- [ ] **Step 1: Add final candidate validation**

In `grantpilot-worker/src/scout.ts`, add:

```ts
type ScoutCandidate = {
  url: string;
  kind: "direct_form" | "portal_application" | "specific_grant_page" | "generic_listing" | "account_registration" | "closed_or_expired" | "unknown";
  quality: "verified_direct" | "verified_portal" | "needs_scout" | "manual_review" | "rejected" | "unknown";
  confidence: number;
  reason: string;
};

async function validateFinalCandidate(page: Page, candidateUrl: string): Promise<ScoutCandidate> {
  try {
    const current = page.url() || candidateUrl;
    const visibleFields = await page.evaluate(() =>
      document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select").length
    ).catch(() => 0);
    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const url = current || candidateUrl;
    const lower = `${title} ${bodyText}`.toLowerCase();

    if (visibleFields >= 3) {
      return { url, kind: "direct_form", quality: "verified_direct", confidence: 95, reason: "Page contains application form fields" };
    }
    if (/account has been successfully created|activate your account|thank you/i.test(lower)) {
      return { url, kind: "account_registration", quality: "manual_review", confidence: 90, reason: "Account registration/activation step detected" };
    }
    if (/login|sign in|create account|register/i.test(lower) && /application|apply|loan|grant/i.test(lower)) {
      return { url, kind: "portal_application", quality: "verified_portal", confidence: 75, reason: "Official portal start/login page detected" };
    }
    return { url, kind: "specific_grant_page", quality: "needs_scout", confidence: 55, reason: "Candidate did not expose form fields or portal proof" };
  } catch {
    return { url: candidateUrl, kind: "unknown", quality: "manual_review", confidence: 30, reason: "Candidate validation failed" };
  }
}
```

- [ ] **Step 2: Stop returning unverified regex/Gemini candidates**

Where `runScoutDiscovery` currently returns a `string`, update it to return `Promise<ScoutCandidate | null>`. Every branch that navigates to a candidate must call `validateFinalCandidate(page, candidateUrl)` and only return candidates with:

```ts
candidate.quality === "verified_direct" || candidate.quality === "verified_portal"
```

If the candidate is `needs_scout`, `manual_review`, or `rejected`, continue other candidates or return it only for manual review.

- [ ] **Step 3: Update Scout DB writes**

Replace `updateGrantApplicationUrl` with:

```ts
export async function updateGrantDirectApplicationUrl(grantId: string, candidate: ScoutCandidate): Promise<void> {
  await getSupabase()
    .from("Grant")
    .update({
      directApplicationUrl: candidate.quality === "verified_direct" || candidate.quality === "verified_portal" ? candidate.url : null,
      applicationUrl: candidate.quality === "verified_direct" || candidate.quality === "verified_portal" ? candidate.url : undefined,
      applicationUrlKind: candidate.kind,
      applicationUrlQuality: candidate.quality,
      applicationUrlConfidence: candidate.confidence,
      applicationUrlVerifiedAt: new Date().toISOString(),
      applicationUrlQualityReason: candidate.reason,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", grantId);
}
```

- [ ] **Step 4: Manual-review unresolved candidates**

In `processScoutJob`, replace the found branch:

```ts
if (candidate && (candidate.quality === "verified_direct" || candidate.quality === "verified_portal")) {
  await markScoutJobResult(job.id, "found", candidate.url);
  await updateGrantDirectApplicationUrl(job.grant_id, candidate);
  if (mode !== "full") await updateGrantUrlStatus(job.grant_id, "live");
} else {
  const reason = candidate?.reason ?? "No verified direct application form or official portal start link identified";
  await markScoutJobResult(job.id, "manual_review_needed", candidate?.url ?? null, reason);
  await updateGrantDirectApplicationUrl(job.grant_id, candidate ?? {
    url: job.homepage_url,
    kind: "unknown",
    quality: "manual_review",
    confidence: 0,
    reason,
  });
}
```

- [ ] **Step 5: Build worker**

Run:

```bash
npm run build
```

Expected: app build passes. If worker has a separate build command, run it from `grantpilot-worker` after checking its `package.json`.

- [ ] **Step 6: Commit**

```bash
git add grantpilot-worker/src/scout.ts
git commit -m "Require verified direct grant form links from Scout"
```

---

### Task 5: Make Suggested Matches Actionable

**Files:**
- Modify: `app/api/grants/eligible-matches/route.ts`
- Modify: `components/grants/eligible-grant-card.tsx`

- [ ] **Step 1: Fetch URL-quality fields**

In `GrantRow`, add:

```ts
  applicationUrlQuality?: string | null;
  applicationUrlKind?: string | null;
  applicationUrlQualityReason?: string | null;
  directApplicationUrl?: string | null;
```

Update the `fetchCachedGrantRowsByIds` select:

```ts
select: "id, name, funder, deadline, funderLocations, url_status, createdAt, eligibility, description, objectives, applicantTypes, sectors, regions, applicationUrlQuality, applicationUrlKind, applicationUrlQualityReason, directApplicationUrl",
```

- [ ] **Step 2: Filter Suggested to verified application links**

Before building `validGrants`, add:

```ts
function hasVerifiedApplicationStart(grant: GrantRow): boolean {
  return grant.applicationUrlQuality === "verified_direct" || grant.applicationUrlQuality === "verified_portal";
}
```

Then filter:

```ts
const validGrants = [...grantsById.values()].filter((grant) =>
  isGrantActionableNow(grant) &&
  (tier !== "suggested" || hasVerifiedApplicationStart(grant)) &&
  !appliedGrantIds.has(grant.id) &&
  !hiddenStateGrantIds.has(grant.id) &&
  grantMatchesFunderLocations(grant.funderLocations, userFunderLocations)
);
```

This keeps “Suggested” valuable. Unresolved 50-84 rows can still appear in lower/review sections if product wants them.

- [ ] **Step 3: Expose link quality to cards**

Add to `EligibleGrant`:

```ts
  applicationUrlQuality?: string | null;
  applicationUrlKind?: string | null;
  applicationUrlQualityReason?: string | null;
```

Set these in the API response from the `grant`.

- [ ] **Step 4: Label unresolved cards**

In `components/grants/eligible-grant-card.tsx`, before buttons add:

```tsx
{grant.applicationUrlQuality && grant.applicationUrlQuality !== "verified_direct" && grant.applicationUrlQuality !== "verified_portal" && (
  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>{grant.applicationUrlQualityReason ?? "Direct application form not verified yet."}</span>
  </div>
)}
```

Change the primary button label:

```tsx
{grant.applicationUrlQuality === "verified_direct" || grant.applicationUrlQuality === "verified_portal" ? "Apply" : "Review link"}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run build
npm run test:grant-url-quality
```

- [ ] **Step 6: Commit**

```bash
git add app/api/grants/eligible-matches/route.ts components/grants/eligible-grant-card.tsx
git commit -m "Show only verified application links as suggested matches"
```

---

### Task 6: Protect the Apply Flow and Detail Page

**Files:**
- Modify: `components/grants/apply-button.tsx`
- Modify: `app/(dashboard)/grants/[id]/page.tsx`
- Modify: `app/api/applications/start/route.ts`
- Modify: `components/grants/edit-application-url.tsx`

- [ ] **Step 1: Detail page uses direct URL for form CTA**

In `GrantDetailPage`, compute:

```ts
const directApplicationUrl = (grant as { directApplicationUrl?: string | null }).directApplicationUrl;
const applicationUrlQuality = (grant as { applicationUrlQuality?: string | null }).applicationUrlQuality;
const canOpenApplication =
  applicationUrlQuality === "verified_direct" || applicationUrlQuality === "verified_portal";
```

Pass to `ApplyButton`:

```tsx
<ApplyButton
  key={grant.id}
  grantId={grant.id}
  profileId={profileId}
  applicationUrl={canOpenApplication ? directApplicationUrl ?? grant.applicationUrl ?? "" : null}
  eligibilityScore={eligibilityScore ?? undefined}
/>
```

- [ ] **Step 2: Apply button blocks unresolved direct link**

In `components/grants/apply-button.tsx`, replace the form CTA area:

```tsx
{applicationUrl ? (
  <a href={applicationUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
    <Button>
      <ExternalLink className="mr-2 h-4 w-4" />
      Open funder form
    </Button>
  </a>
) : (
  <Button disabled title="Direct application form not verified yet">
    Direct form not verified
  </Button>
)}
```

- [ ] **Step 3: Start API refuses unresolved links**

In `app/api/applications/start/route.ts`, include fields in the grant select:

```ts
.select("id, name, applicationUrl, directApplicationUrl, applicationUrlQuality, deadline, url_status, eligibility, description, objectives")
```

Before usage-limit check:

```ts
const quality = (grant as { applicationUrlQuality?: string | null }).applicationUrlQuality;
const directUrl = (grant as { directApplicationUrl?: string | null }).directApplicationUrl;
if (quality !== "verified_direct" && quality !== "verified_portal") {
  return NextResponse.json(
    { error: "This grant does not have a verified direct application form yet. Use Find application form or review the original grant page first." },
    { status: 409 }
  );
}
```

Use `directUrl ?? grant.applicationUrl` when creating `cu_session_items`.

- [ ] **Step 4: Save admin/manual URL quality**

When `EditApplicationUrl` saves a URL, PATCH should classify it server-side in `app/api/grants/[id]/route.ts` and write:

```ts
{
  applicationUrl: directApplicationUrl ?? detailUrl,
  detailUrl,
  directApplicationUrl,
  applicationUrlKind,
  applicationUrlQuality,
  applicationUrlConfidence,
  applicationUrlQualityReason,
  applicationUrlVerifiedAt: directApplicationUrl ? new Date().toISOString() : null,
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run build
npm run test:grant-url-quality
```

- [ ] **Step 6: Commit**

```bash
git add components/grants/apply-button.tsx app/'(dashboard)'/grants/'[id]'/page.tsx app/api/applications/start/route.ts components/grants/edit-application-url.tsx app/api/grants/'[id]'/route.ts
git commit -m "Block application prep until direct grant form is verified"
```

---

### Task 7: Backfill and Quarantine Existing Bad Links

**Files:**
- Create: `scripts/audit-grant-application-links.ts`
- Modify: `package.json`

- [ ] **Step 0: Run the expired-grant audit first**

Do not classify direct application links for already-closed grants. First run:

```bash
GRANT_AUDIT_LIMIT=2000 npm run audit:expired-grants
```

Expected: historic pages such as the 2019 Nesta CareerTech page already have `url_status = expired` before this link-quality audit starts.

- [ ] **Step 1: Add the audit script**

```ts
// scripts/audit-grant-application-links.ts
import { getSupabaseAdmin } from "../lib/supabase";
import { classifyGrantApplicationUrl } from "../lib/grant-application-url-quality";
import { enqueueGrantForScoutIfProgrammeUrl } from "../lib/enqueue-scout";

const supabase = getSupabaseAdmin();

async function main() {
  const { data: grants, error } = await supabase
    .from("Grant")
    .select("id, name, applicationUrl, detailUrl, directApplicationUrl, applicationUrlQuality")
    .order("createdAt", { ascending: false })
    .limit(2000);

  if (error) throw new Error(error.message);

  let verified = 0;
  let queued = 0;
  let rejected = 0;

  for (const grant of grants ?? []) {
    const url = String(grant.directApplicationUrl ?? grant.detailUrl ?? grant.applicationUrl ?? "").trim();
    if (!url) continue;
    const classification = classifyGrantApplicationUrl(url);
    await supabase
      .from("Grant")
      .update({
        detailUrl: grant.detailUrl ?? grant.applicationUrl,
        directApplicationUrl:
          classification.quality === "verified_direct" || classification.quality === "verified_portal" ? url : null,
        applicationUrlKind: classification.kind,
        applicationUrlQuality: classification.quality,
        applicationUrlConfidence: classification.confidence,
        applicationUrlQualityReason: classification.reason,
        applicationUrlVerifiedAt:
          classification.quality === "verified_direct" || classification.quality === "verified_portal"
            ? new Date().toISOString()
            : null,
      })
      .eq("id", grant.id);

    if (classification.quality === "verified_direct" || classification.quality === "verified_portal") verified++;
    else if (classification.quality === "needs_scout") {
      if (await enqueueGrantForScoutIfProgrammeUrl(grant.id)) queued++;
    } else if (classification.quality === "rejected") rejected++;
  }

  console.log({ scanned: grants?.length ?? 0, verified, queued, rejected });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Add package script**

```json
"audit:grant-links": "tsx scripts/audit-grant-application-links.ts"
```

- [ ] **Step 3: Run in staging/local first**

Run:

```bash
npm run audit:grant-links
```

Expected: prints counts for `verified`, `queued`, and `rejected`. Do not run against production until migration is applied.

- [ ] **Step 4: Manually inspect examples**

Confirm these outcomes in Supabase:

```text
Nesta CareerTech 2019 page -> rejected or manual_review, not suggested
Bristol business support page -> rejected/manual_review, not suggested
Start Up Loans account activation/thank-you -> manual_review/account_registration, not direct_form
Google Forms/Airtable/Typeform/Submittable -> verified_direct
Innovate UK IFS specific application portal -> verified_portal
```

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-grant-application-links.ts package.json
git commit -m "Add audit for existing grant application links"
```

---

### Task 8: Admin Review Writes Verified Links

**Files:**
- Modify: `app/api/admin/review-queue/route.ts`
- Modify: `components/admin/review-queue-actions.tsx`

- [ ] **Step 1: Classify admin-approved application links**

In `app/api/admin/review-queue/route.ts`, inside `approve_application_link`, import:

```ts
import { classifyGrantApplicationUrl } from "@/lib/grant-application-url-quality";
```

After endpoint normalization:

```ts
const classification = classifyGrantApplicationUrl(endpoint);
if (classification.quality !== "verified_direct" && classification.quality !== "verified_portal") {
  return NextResponse.json(
    { error: `This does not look like a direct application form or portal start: ${classification.reason}` },
    { status: 400 }
  );
}
```

Update `Grant`:

```ts
.update({
  applicationUrl: endpoint,
  directApplicationUrl: endpoint,
  applicationUrlKind: classification.kind,
  applicationUrlQuality: classification.quality,
  applicationUrlConfidence: classification.confidence,
  applicationUrlQualityReason: classification.reason,
  applicationUrlVerifiedAt: new Date().toISOString(),
  url_status: "unknown",
  url_checked_at: null,
})
```

- [ ] **Step 2: Update admin UI copy**

In `components/admin/review-queue-actions.tsx`, change the placeholder for link approval to:

```tsx
placeholder={approvingLink ? "Direct form or official portal start URL" : "Source URL"}
```

- [ ] **Step 3: Verify and commit**

Run:

```bash
npm run build
npm run test:grant-url-quality
git add app/api/admin/review-queue/route.ts components/admin/review-queue-actions.tsx
git commit -m "Validate admin-approved grant application links"
```

---

### Task 9: Final Verification

**Files:**
- No code changes unless verification exposes a bug.

- [ ] **Step 1: Run static checks**

```bash
npm run lint
npm run build
npm run test:grant-url-quality
npm run test:grant-actionability
npm run test:eligibility-score-guards
```

Expected:
- Build passes.
- New URL-quality tests pass.
- Existing actionability and score guard tests still pass.
- Lint has no new errors. Existing warnings can be listed in the final summary.

- [ ] **Step 2: Manual QA cases**

Check in a browser:

```text
/grants/eligible
- 85% Suggested list only shows grants with verified_direct or verified_portal.
- Unresolved/generic links are absent from Suggested or labelled as review-only in lower sections.

/grants/[id]
- Verified direct form shows "Open funder form".
- Specific grant page without form shows "Find application form" and no direct form CTA.
- Manual review state clearly says "Direct application form not verified yet".

Admin review queue
- Approving generic Bristol/Nesta pages fails with a clear validation error.
- Approving a real form/portal writes directApplicationUrl and verified quality.
```

- [ ] **Step 3: Commit any fixes and push**

```bash
git status --short
git push origin versiontwo
```

Expected: branch pushes cleanly.

---

## Rollout Notes

- Apply migration first, then deploy app, then deploy worker, then run the backfill/audit script.
- Do not immediately delete or overwrite historical `applicationUrl` values. Keep `detailUrl` so users can still research grants even when direct form discovery is pending.
- For daily email and WhatsApp, use only `verified_direct` and `verified_portal` for “fresh strong matches” so notifications do not send users to dead ends.
- Keep manual review queue active. Some funders intentionally hide application forms behind account creation, and those should be labelled as portal/account flows, not direct forms.

## Self-Review

- Spec coverage: The plan addresses user screenshots: historic Nesta deadline, generic Bristol support page, Start Up Loans account activation, and the broader “Suggested links have no end value” issue.
- Placeholder scan: No task relies on “TBD” implementation; each task identifies exact files and concrete code shape.
- Type consistency: `applicationUrlKind`, `applicationUrlQuality`, `directApplicationUrl`, and `detailUrl` are used consistently across schema, ingestion, Scout, API, and UI tasks.
