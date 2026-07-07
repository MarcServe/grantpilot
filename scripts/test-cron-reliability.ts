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

const eligibilityDiagnostics = read("lib/eligibility-notification-diagnostics.ts");
assert.match(
  eligibilityDiagnostics,
  /getSuppressedGrantIds\(supabase,\s*orgId,\s*profile\.id,\s*\{\s*includeViewed:\s*true\s*\}\)/,
  "eligibility notification diagnostics should count viewed grants the same way active alerts do"
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
