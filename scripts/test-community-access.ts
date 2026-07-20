import assert from "node:assert/strict";
import {
  generateCommunityAccessToken,
  hashCommunityAccessToken,
  normaliseCommunitySlug,
  partnerNameFromSlug,
} from "../lib/community-access";
import { planAllowsForOrg, resolveEffectivePlanForOrg } from "../lib/plan-features";

const now = new Date("2026-07-20T12:00:00.000Z");
const expiredTrialCreatedAt = new Date("2026-07-01T12:00:00.000Z");
const futureCommunityExpiry = new Date("2026-10-18T12:00:00.000Z");
const expiredCommunityExpiry = new Date("2026-07-19T12:00:00.000Z");

assert.equal(normaliseCommunitySlug(" Future Space "), "future-space");
assert.equal(partnerNameFromSlug("launchspace"), "LaunchSpace");
assert.equal(partnerNameFromSlug("barclays-eagle-labs"), "Barclays Eagle Labs");

const token = generateCommunityAccessToken();
assert.equal(typeof token, "string");
assert.ok(token.length >= 24, "generated token should be long enough for shareable access links");
assert.equal(hashCommunityAccessToken(token), hashCommunityAccessToken(token), "token hashing should be deterministic");
assert.notEqual(hashCommunityAccessToken(token), token, "stored token hash should not equal the clear token");

assert.equal(
  resolveEffectivePlanForOrg(
    {
      plan: "FREE_TRIAL",
      createdAt: expiredTrialCreatedAt,
      communityAccessPlan: "GROWTH",
      communityAccessExpiresAt: futureCommunityExpiry,
    },
    now
  ),
  "GROWTH",
  "active community access should upgrade an expired trial to Growth"
);

assert.equal(
  planAllowsForOrg(
    {
      plan: "FREE_TRIAL",
      createdAt: expiredTrialCreatedAt,
      communityAccessPlan: "GROWTH",
      communityAccessExpiresAt: futureCommunityExpiry,
    },
    "whatsapp_opportunity_alerts"
  ),
  true,
  "community Growth should unlock WhatsApp opportunity alerts"
);

assert.equal(
  planAllowsForOrg(
    {
      plan: "FREE_TRIAL",
      createdAt: expiredTrialCreatedAt,
      communityAccessPlan: "GROWTH",
      communityAccessExpiresAt: expiredCommunityExpiry,
    },
    "whatsapp_opportunity_alerts"
  ),
  false,
  "expired community access should fall back to expired trial gating"
);

assert.equal(
  resolveEffectivePlanForOrg(
    {
      plan: "PRO",
      createdAt: expiredTrialCreatedAt,
      communityAccessPlan: "GROWTH",
      communityAccessExpiresAt: futureCommunityExpiry,
    },
    now
  ),
  "PRO",
  "higher paid plans should take precedence over community Growth"
);

assert.equal(
  resolveEffectivePlanForOrg(
    {
      plan: "STARTER",
      createdAt: expiredTrialCreatedAt,
      communityAccessPlan: "GROWTH",
      communityAccessExpiresAt: futureCommunityExpiry,
    },
    now
  ),
  "GROWTH",
  "community Growth should temporarily outrank Starter"
);

console.log("community access tests passed");
