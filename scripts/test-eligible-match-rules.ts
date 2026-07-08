import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  matchSectionAllowsCandidate,
  sortEligibleMatchesForSection,
} from "../lib/eligible-match-rules";

assert.equal(
  matchSectionAllowsCandidate({ section: "suggested", userState: "viewed", scoringSource: "openai" }),
  false,
  "viewed grants should not count as active Suggested"
);
assert.equal(
  matchSectionAllowsCandidate({ section: "reviewed", userState: "viewed", scoringSource: "openai" }),
  true,
  "viewed grants should remain available in Reviewed"
);
for (const status of ["deferred", "applied", "dismissed"] as const) {
  assert.equal(
    matchSectionAllowsCandidate({ section: "suggested", userState: status, scoringSource: "openai" }),
    false,
    `${status} grants should be suppressed from active matches`
  );
}
assert.equal(
  matchSectionAllowsCandidate({ section: "within_reach", userState: null, scoringSource: "heuristic" }),
  false,
  "heuristic rows should not appear in trusted Within reach"
);
assert.equal(
  matchSectionAllowsCandidate({ section: "needs_review", userState: null, scoringSource: "heuristic" }),
  true,
  "heuristic rows should appear in Needs full AI review"
);

const june = { grantName: "June grant", score: 60, addedAt: "2026-06-10T00:00:00.000Z", scoredAt: "2026-06-01T00:00:00.000Z" };
const may = { grantName: "May grant", score: 84, addedAt: "2026-05-20T00:00:00.000Z", scoredAt: "2026-06-30T00:00:00.000Z" };
const april = { grantName: "April grant", score: 84, addedAt: "2026-04-20T00:00:00.000Z", scoredAt: "2026-07-01T00:00:00.000Z" };

const withinReach = [april, may, june].sort((a, b) => sortEligibleMatchesForSection("within_reach", a, b));
assert.deepEqual(
  withinReach.map((item) => item.grantName),
  ["June grant", "May grant", "April grant"],
  "Within reach should prioritize newest grant createdAt before score/scored date"
);

const highFresh = { grantName: "Fresh high", score: 85, addedAt: "2026-06-01T00:00:00.000Z" };
const highHigherScore = { grantName: "Older higher score", score: 91, addedAt: "2026-04-01T00:00:00.000Z" };
const suggested = [highFresh, highHigherScore].sort((a, b) => sortEligibleMatchesForSection("suggested", a, b));
assert.equal(suggested[0].grantName, "Older higher score", "Suggested should keep score as primary ordering");

const eligibleMatchesRoute = readFileSync("app/api/grants/eligible-matches/route.ts", "utf8");
assert.match(
  eligibleMatchesRoute,
  /section !== "suggested" && matches\.length >= minimumMatchesForPage/,
  "non-Suggested tiers should stop scanning once the requested page window is filled"
);
assert.match(
  eligibleMatchesRoute,
  /availableCandidateCountIsEstimate: !scanComplete/,
  "early-stopped match tiers should return estimated counts"
);

const batchedList = readFileSync("components/grants/batched-eligible-grants-list.tsx", "utf8");
assert.match(
  batchedList,
  /const firstTier = initialTier \?\? "suggested"/,
  "opportunity page should load Suggested first by default"
);
assert.doesNotMatch(
  batchedList,
  /const sequence = activeTier \? \[activeTier\] : TIER_ORDER/,
  "opportunity page should not clear and reload all sections sequentially on every tab change"
);

console.log("eligible match rule tests passed");
