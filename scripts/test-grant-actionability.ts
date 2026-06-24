import assert from "node:assert/strict";
import { getGrantFreshnessStatus } from "../lib/grant-freshness";
import {
  getGrantActionabilityStatus,
  verifyGrantActionable,
  type GrantActionabilityInput,
} from "../lib/grant-actionability";

const now = new Date("2026-06-01T12:00:00Z");

function freshness(grant: GrantActionabilityInput) {
  return getGrantFreshnessStatus(grant, now);
}

assert.equal(
  freshness({
    name: "Archived grant",
    eligibility: "Deadline for applications is 16 January 2015.",
  }).usable,
  false,
  "past application deadline text should be stale"
);

assert.equal(
  freshness({
    name: "CareerTech Challenge Fund",
    eligibility:
      "Apply to the CareerTech Challenge Fund by 2pm 9th December 2019. Shortlisted applicants will be informed in January 2020 and successful applicants in late February 2020.",
  }).usable,
  false,
  "2019 CareerTech application window should be stale"
);

assert.equal(
  freshness({
    name: "Inclusive Technology Prize",
    eligibility:
      "The winner of the £50,000 contract will be announced in March 2016. Deadline for applications is 16 January 2015.",
  }).usable,
  false,
  "archived competition timing near an application deadline should be stale"
);

assert.equal(
  freshness({
    name: "Current UK grant",
    deadline: "2026-12-15",
    eligibility: "Open to UK registered SMEs.",
  }).usable,
  true,
  "future explicit deadline should stay usable"
);

const unknownNoDeadline = getGrantActionabilityStatus(
  {
    name: "Unknown deadline grant",
    applicationUrl: "https://example.com/grants/current",
    url_status: "unknown",
    eligibility: "Open to UK businesses.",
  },
  now
);
assert.equal(unknownNoDeadline.usable, true, "unknown deadline grants remain displayable before live verification");
assert.equal(unknownNoDeadline.requiresLiveVerification, true, "unknown deadline grants require notification preflight");

async function main() {
  let updatePayload: Record<string, unknown> | null = null;
  const mockSupabase = {
    from: () => ({
      update: (values: Record<string, unknown>) => {
        updatePayload = values;
        return {
          eq: async () => ({ error: null }),
        };
      },
    }),
  };

  const expiredAfterPreflight = await verifyGrantActionable(
    {
      id: "grant-1",
      name: "Unknown deadline grant",
      applicationUrl: "https://example.com/grants/archive",
      url_status: "unknown",
      eligibility: "Open to UK businesses.",
    },
    {
      now,
      supabase: mockSupabase,
      check: async () => ({
        status: "expired",
        httpStatus: 200,
        reason: "Programme appears closed/expired",
      }),
    }
  );
  assert.equal(expiredAfterPreflight.usable, false, "expired live preflight should block notification");
  assert.ok(updatePayload, "expired preflight should persist URL status");
  assert.equal((updatePayload as Record<string, unknown>).url_status, "expired", "expired preflight should persist URL status");

  let liveCheckCount = 0;
  const futureDeadline = await verifyGrantActionable(
    {
      id: "grant-2",
      name: "Future deadline grant",
      applicationUrl: "https://example.com/grants/open",
      deadline: "2026-12-15",
      url_status: "unknown",
      eligibility: "Open to UK businesses.",
    },
    {
      now,
      check: async () => {
        liveCheckCount += 1;
        return { status: "expired", httpStatus: 200, reason: "Should not run" };
      },
    }
  );
  assert.equal(futureDeadline.usable, true, "future deadline grant should stay actionable");
  assert.equal(liveCheckCount, 0, "future deadline grant should not spend live preflight");

  console.log("grant actionability checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
