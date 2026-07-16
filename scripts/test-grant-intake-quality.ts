import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalizeGrantUrl,
  grantCandidateFingerprint,
  grantCandidateTextFingerprint,
} from "../lib/grant-candidate-quality";
import { getGrantFreshnessStatus } from "../lib/grant-freshness";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const urlA = canonicalizeGrantUrl("https://Example.org/fund/apply/?utm_source=x&ref=abc&id=42#top");
const urlB = canonicalizeGrantUrl("https://example.org/fund/apply?id=42");
assert.equal(urlA, urlB, "canonical grant URLs should remove tracking params, hashes, and host-case differences");

const candidateA = {
  name: "Digital Growth Grant",
  funder: "Example Council",
  deadline: "2026-09-01T00:00:00.000Z",
  applicationUrl: "https://example.org/apply?utm_campaign=test",
};
const candidateB = {
  name: " digital   growth grant ",
  funder: "Example Council",
  deadline: "2026-09-01",
  applicationUrl: "https://example.org/apply",
};
assert.equal(
  grantCandidateTextFingerprint(candidateA),
  grantCandidateTextFingerprint(candidateB),
  "text fingerprints should normalize title, funder, and deadline"
);
assert.equal(
  grantCandidateFingerprint(candidateA),
  grantCandidateFingerprint(candidateB),
  "candidate fingerprints should normalize tracking-only URL differences"
);

const now = new Date("2026-07-16T12:00:00.000Z");
assert.equal(
  getGrantFreshnessStatus({
    name: "CareerTech Challenge Fund",
    description: "Apply to the CareerTech Challenge Fund by 2pm 9th December 2019.",
  }, now).usable,
  false,
  "historic application deadlines should be rejected before active display"
);
assert.equal(
  getGrantFreshnessStatus({
    name: "Old innovation round",
    description: "This funding round is now closed to applications. The deadline was 3 March 2025.",
  }, now).usable,
  false,
  "closed rounds with old dates should be rejected"
);

const grantsIngest = read("lib/grants-ingest.ts");
const precheckIndex = grantsIngest.indexOf("const existing = await findExistingGrantCandidate");
const verifyIndex = grantsIngest.indexOf("const verified = await verifyGrantActionable");
assert.ok(precheckIndex > 0 && verifyIndex > 0 && precheckIndex < verifyIndex, "upsertGrant should check known candidates before expensive actionability verification");

const grantsDiscovery = read("lib/grants-discovery.ts");
assert.ok(
  grantsDiscovery.indexOf("findExistingGrantCandidate") < grantsDiscovery.indexOf("checkUrlHealth"),
  "AI discovery should check known candidates before URL health verification"
);

const autoSeed = read("lib/grant-source-auto-seed.ts");
assert.match(autoSeed, /shouldWriteImportLog/, "duplicate-only source seed import logs should be throttled");
assert.match(autoSeed, /24 \* 60 \* 60 \* 1000/, "source seed duplicate log throttle should use a daily window");

const adminPage = read("app/admin/page.tsx");
assert.match(adminPage, /Intake quality/, "admin should show intake quality metrics");
assert.match(adminPage, /duplicateRate/, "admin intake quality should expose duplicate rate");
assert.match(adminPage, /needsScoutRate/, "admin intake quality should expose unknown/direct-link scout rate");

const intelligenceQueue = read("lib/grant-intelligence-queue.ts");
assert.match(intelligenceQueue, /GRANT_INTELLIGENCE_RECENCY_BONUS/, "grant intelligence queue should prioritize recent grants");

const deepScoreQueue = read("lib/eligibility-deep-score-queue.ts");
assert.match(deepScoreQueue, /FRESH_DEEP_SCORE_RECENCY_BONUS/, "deep-score queue should prioritize newest fresh grants within the fresh window");
assert.match(deepScoreQueue, /_grantCreatedAt/, "deep-score refresh selection should sort fresh grants newest-first");

const scaleSimulation = read("scripts/simulate-grant-scale-capacity.ts");
assert.match(scaleSimulation, /Notifications: disabled\/read-only/, "capacity simulation should clearly run without notifications");
assert.doesNotMatch(scaleSimulation, /NotificationLog|sendWhatsApp|sendEmail|resend/i, "capacity simulation must not send or record notifications");

console.log("Grant intake quality checks passed.");
