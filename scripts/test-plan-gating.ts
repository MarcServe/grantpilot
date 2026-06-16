import assert from "node:assert/strict";
import { planAllowsForOrg } from "../lib/plan-features";

const now = new Date();
const activeTrialCreatedAt = new Date(now);
activeTrialCreatedAt.setDate(activeTrialCreatedAt.getDate() - 2);

const expiredTrialCreatedAt = new Date(now);
expiredTrialCreatedAt.setDate(expiredTrialCreatedAt.getDate() - 12);

assert.equal(
  planAllowsForOrg({ plan: "FREE_TRIAL", createdAt: activeTrialCreatedAt }, "proactive_notifications"),
  true,
  "active free-trial organisations should receive proactive notifications"
);

assert.equal(
  planAllowsForOrg({ plan: "FREE_TRIAL", createdAt: expiredTrialCreatedAt }, "proactive_notifications"),
  false,
  "expired free-trial organisations should be gated from proactive notifications"
);

assert.equal(
  planAllowsForOrg({ plan: "BUSINESS", createdAt: expiredTrialCreatedAt }, "proactive_notifications"),
  true,
  "paid organisations should keep proactive notifications"
);

console.log("plan gating tests passed");
