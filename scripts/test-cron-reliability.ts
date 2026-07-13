import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyGrantSourceFailure, sourceClaimMatches } from "../lib/grant-sources";
import { shouldEnqueueNextGrantsGovPage } from "../lib/grant-sync-jobs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const grantSyncRoute = read("app/api/cron/grant-sync/route.ts");
assert.match(grantSyncRoute, /enqueueGrantSync/, "grant-sync cron should enqueue work");
assert.doesNotMatch(grantSyncRoute, /syncGrantsFrom/, "grant-sync cron should not run syncs inline");
assert.match(grantSyncRoute, /maxDuration\s*=\s*30/, "grant-sync cron should have a short maxDuration");

const sourceCrawlerRoute = read("app/api/cron/grant-source-crawler/route.ts");
assert.match(sourceCrawlerRoute, /enqueueDueGrantSourceRuns/, "grant-source crawler cron should enqueue work");
assert.doesNotMatch(sourceCrawlerRoute, /runDueGrantSources/, "grant-source crawler cron should not run all sources inline");
assert.match(sourceCrawlerRoute, /maxDuration\s*=\s*30/, "grant-source crawler cron should have a short maxDuration");

const dailyDigestSafeguard = read("inngest/daily-notification-safeguard.ts");
assert.match(
  dailyDigestSafeguard,
  /toISOString\(\)\.slice\(0,\s*13\)/,
  "daily digest enqueue should use an hourly idempotency key so a pre-scoring no-match run cannot block later strong matches"
);
assert.match(
  dailyDigestSafeguard,
  /row\.status === "viewed"/,
  "daily digest candidates should suppress viewed grants like the active Suggested list"
);
assert.match(
  dailyDigestSafeguard,
  /\.filter\(\(row\) => !row\.notified_at\)/,
  "daily digest should keep never-notified 85%+ matches in the fresh section"
);
assert.match(
  dailyDigestSafeguard,
  /\.not\("notified_at",\s*"is",\s*null\)/,
  "daily digest should keep already-notified 85%+ matches as still-eligible reminders"
);
assert.doesNotMatch(
  dailyDigestSafeguard,
  /isOutsideDigestGrantRepeatCooldown/,
  "daily digest should not suppress still-active 85%+ reminders just because they were sent recently"
);

const eligibilityRefresh = read("inngest/eligibility-refresh.ts");
assert.match(
  eligibilityRefresh,
  /const LAYER3_TOP_N = positiveIntFromEnv\("ELIGIBILITY_DEEP_SCORE_TOP_N",\s*10\)/,
  "eligibility refresh should keep inline OpenAI scoring bounded so scoped workers finish before serverless timeouts"
);
assert.match(
  eligibilityRefresh,
  /const REFRESH_WORKER_CONCURRENCY = positiveIntFromEnv\("ELIGIBILITY_REFRESH_WORKER_CONCURRENCY",\s*2\)/,
  "eligibility refresh should avoid high concurrent org workers that can OOM /api/inngest"
);
assert.match(
  eligibilityRefresh,
  /toISOString\(\)\.slice\(0,\s*13\)/,
  "eligibility refresh enqueue should use hourly idempotency so a killed precompute can retry later the same day"
);
assert.match(
  eligibilityRefresh,
  /eligibility-refresh:\$\{safeSource\}:\$\{orgId\}:\$\{hourKey\}/,
  "eligibility refresh idempotency should include source and org so duplicate schedulers do not block each other"
);
assert.match(
  eligibilityRefresh,
  /jobName:\s*"Eligibility Refresh Scoped Worker"/,
  "eligibility refresh scoped workers should write CronRunLog entries"
);
assert.match(
  eligibilityRefresh,
  /if \(!options\?\.includeRecentlyNotified && assessment\.notified_at\) return null;/,
  "eligibility refresh should keep fresh digest items separate from reminder items"
);
assert.match(
  eligibilityRefresh,
  /\.not\("notified_at",\s*"is",\s*null\)/,
  "eligibility refresh should include already-notified 85%+ matches in reminder digest"
);
assert.doesNotMatch(
  eligibilityRefresh,
  /isOutsideDigestGrantRepeatCooldown/,
  "eligibility refresh should not skip still-active reminders due to a per-grant repeat cooldown"
);

const eligibilityDiagnostics = read("lib/eligibility-notification-diagnostics.ts");
assert.match(
  eligibilityDiagnostics,
  /getSuppressedGrantIds\(supabase,\s*orgId,\s*profile\.id,\s*\{\s*includeViewed:\s*true\s*\}\)/,
  "eligibility notification diagnostics should count viewed grants the same way active alerts do"
);
assert.match(
  eligibilityDiagnostics,
  /highMatchUnnotified:\s*high\.length/,
  "eligibility notification diagnostics should treat all active 85%+ matches as notify-ready reminders until actioned"
);
assert.doesNotMatch(
  eligibilityDiagnostics,
  /isOutsideDigestGrantRepeatCooldown/,
  "eligibility notification diagnostics should not hide active 85%+ reminders due to a per-grant repeat cooldown"
);
assert.doesNotMatch(
  eligibilityDiagnostics,
  /WHATSAPP_COOLDOWN_HOURS|function isOutsideCooldown/,
  "eligibility notification diagnostics should not use a separate WhatsApp-only cooldown"
);

const eligibleMatchCache = read("lib/eligible-match-cache.ts");
assert.match(
  eligibleMatchCache,
  /eligible-match-grant-ordered-assessments:/,
  "eligible match cache clearing should include grant-ordered assessment batches"
);

const deepScoreQueue = read("lib/eligibility-deep-score-queue.ts");
assert.match(
  deepScoreQueue,
  /QUEUE_LOOKUP_BATCH_SIZE/,
  "deep-score enqueue should chunk existing-row lookups to avoid long Supabase filter URLs"
);
assert.match(
  deepScoreQueue,
  /grantIdBatch/,
  "deep-score enqueue should query existing queue rows in grant-id batches"
);
assert.match(
  deepScoreQueue,
  /QUEUE_INSERT_BATCH_SIZE/,
  "deep-score enqueue should chunk backlog inserts to avoid Supabase request-size failures"
);
assert.match(
  deepScoreQueue,
  /dedupedRowsByKey/,
  "deep-score enqueue should dedupe repeated grant candidates before inserting queue rows"
);
assert.match(
  deepScoreQueue,
  /\.from\("eligibility_deep_score_queue"\)\.insert\(batch\)/,
  "deep-score enqueue should insert pre-filtered new rows in batches instead of relying on fragile upsert conflict targets"
);
assert.match(
  deepScoreQueue,
  /\.insert\(row\)\.select\("id"\)/,
  "deep-score enqueue should fall back to single-row inserts when one batch is rejected"
);
assert.doesNotMatch(
  deepScoreQueue,
  /onConflict:\s*"organisation_id,profile_id,grant_id,profile_hash,grant_content_hash"/,
  "deep-score enqueue should not require a plain-column ON CONFLICT target that may not exist in production"
);
assert.match(
  deepScoreQueue,
  /JSON\.stringify\(error\)/,
  "deep-score enqueue should log Supabase error objects with useful details"
);

const inngestRoute = read("app/api/inngest/route.ts");
for (const fn of [
  "grantSyncSourceRequested",
  "grantSyncGrantsGovPageRequested",
  "grantSourceRunRequested",
  "grantPostprocessRequested",
]) {
  assert.match(inngestRoute, new RegExp(fn), `${fn} should be registered with Inngest`);
}

const grantsIngest = read("lib/grants-ingest.ts");
assert.match(grantsIngest, /requestGrantPostprocess/, "upsertGrant should enqueue postprocess work");
assert.doesNotMatch(
  grantsIngest,
  /generateAndStoreGrantEmbedding/,
  "upsertGrant should not import or call grant embedding directly"
);
assert.doesNotMatch(grantsIngest, /checkUrlHealth\(/, "upsertGrant should not call URL health checks directly");

assert.deepEqual(
  shouldEnqueueNextGrantsGovPage({ startRecord: 0, rows: 100, rawHits: 100, hitCount: 350, maxTotal: 500 }),
  { enqueue: true, nextStartRecord: 100 },
  "Grants.gov worker should enqueue the next page when more rows remain"
);
assert.equal(
  shouldEnqueueNextGrantsGovPage({ startRecord: 400, rows: 100, rawHits: 100, hitCount: 800, maxTotal: 500 }).enqueue,
  false,
  "Grants.gov worker should stop at the configured cap"
);
assert.equal(
  shouldEnqueueNextGrantsGovPage({ startRecord: 0, rows: 100, rawHits: 0, hitCount: 800, maxTotal: 500 }).enqueue,
  false,
  "Grants.gov worker should stop when the API returns no hits"
);

assert.equal(classifyGrantSourceFailure(new Error("HTTP 403 Forbidden")).kind, "blocked");
assert.equal(classifyGrantSourceFailure(new Error("404 Not Found")).kind, "missing");
assert.equal(classifyGrantSourceFailure(new Error("fetch timeout")).kind, "timeout");
assert.equal(classifyGrantSourceFailure(new Error("TypeError: undefined")).external, false);

assert.equal(sourceClaimMatches({ claim_token: "abc" }, "abc"), true, "matching claim token should process");
assert.equal(sourceClaimMatches({ claim_token: "abc" }, "def"), false, "stale claim token should skip");
assert.equal(sourceClaimMatches({ claim_token: null }, null), true, "missing token fallback should process");

const migration = read("supabase/migrations/059_grant_source_claims.sql");
assert.match(migration, /claim_due_grant_sources/, "migration should create the source claim RPC");
assert.match(migration, /FOR UPDATE SKIP LOCKED/, "source claim RPC should use SKIP LOCKED");
assert.match(migration, /claim_token/, "migration should add source claim metadata");

console.log("cron reliability tests passed");
