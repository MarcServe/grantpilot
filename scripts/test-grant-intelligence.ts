import assert from "node:assert/strict";

import { matchProfileToGrantIntelligence } from "../lib/grant-intelligence-match";
import type { GrantIntelligence } from "../lib/grant-intelligence-schema";

const baseProfile = {
  businessName: "Biz Boosters Limited",
  sector: "AI technology",
  description: "UK technology startup building AI automation tools for SMEs.",
  missionStatement: "Help small businesses access funding and automate operational work.",
  location: "London, UK",
  businessType: "Business",
  employeeCount: 4,
  annualRevenue: 5000,
  yearEstablished: 2024,
  fundingMin: 10000,
  fundingMax: 100000,
  fundingPurposes: ["AI", "software", "innovation"],
  fundingDetails: "Funding will support AI product development and market validation.",
};

const baseGrant = {
  id: "grant-test",
  name: "UK AI Innovation Grant",
  funder: "Example Funder",
  amount: 50000,
  eligibility: "Open to UK SMEs and startups developing AI innovation projects.",
  description: "Supports AI, software, prototype development, and commercial validation.",
  objectives: "Grow innovative UK technology startups.",
  applicantTypes: ["SME", "startup", "business"],
  sectors: ["AI", "technology"],
  regions: ["UK"],
};

const baseIntelligence: GrantIntelligence = {
  status: "ready",
  model: "test",
  confidence: 88,
  reusableSummary: "UK innovation funding for SMEs developing AI technology.",
  extractedCriteria: {},
  eligibilityCriteria: ["UK SME or startup", "AI or technology project"],
  hardGates: ["Applicant must be UK based"],
  applicantTypes: ["SME", "startup", "business"],
  sectors: ["AI", "technology", "software"],
  regions: ["UK"],
  fundingPurposes: ["AI", "innovation", "prototype development"],
  semanticTags: ["AI", "automation", "software", "SME"],
  measurableRequirements: [],
  exclusions: [],
  freshness: { status: "current", deadline: null, evidence: ["Open call"] },
  scoringHints: {
    strongSignals: ["UK technology SME", "AI product development"],
    weakSignals: [],
    redFlags: [],
  },
};

const strong = matchProfileToGrantIntelligence(baseProfile, baseGrant, baseIntelligence);
assert.equal(strong.source, "intelligence");
assert.equal(strong.decision, "likely_eligible");
assert.ok(strong.score >= 85, `expected strong score, got ${strong.score}`);
assert.equal(strong.requiresOpenAiReview, false);

const charityOnly = matchProfileToGrantIntelligence(baseProfile, baseGrant, {
  ...baseIntelligence,
  hardGates: ["Registered charities only"],
  applicantTypes: ["charity"],
  scoringHints: {
    strongSignals: ["AI theme"],
    weakSignals: [],
    redFlags: [],
  },
});
assert.equal(charityOnly.decision, "unlikely");
assert.ok(charityOnly.score < 40, `expected charity gate to block, got ${charityOnly.score}`);
assert.ok((charityOnly.missing ?? []).some((item) => /applicant/i.test(item)) || charityOnly.riskSignals.some((item) => /charit/i.test(item)));

const missingRevenueProfile = { ...baseProfile, annualRevenue: null };
const revenueRequirement = matchProfileToGrantIntelligence(missingRevenueProfile, baseGrant, {
  ...baseIntelligence,
  measurableRequirements: [{ label: "Annual revenue evidence", required: true }],
});
assert.notEqual(revenueRequirement.decision, "unlikely");
assert.ok((revenueRequirement.missing ?? []).some((item) => /revenue/i.test(item)));
assert.ok(revenueRequirement.requiresOpenAiReview);

const stale = matchProfileToGrantIntelligence(baseProfile, baseGrant, {
  ...baseIntelligence,
  freshness: { status: "stale", deadline: "2015-01-16", evidence: ["Deadline passed"] },
});
assert.equal(stale.decision, "unlikely");
assert.ok(stale.score <= 20, `expected stale grant to be capped, got ${stale.score}`);

console.log("grant-intelligence tests passed");
