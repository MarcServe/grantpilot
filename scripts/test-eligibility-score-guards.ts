import assert from "node:assert/strict";
import { applyEligibilityScoreGuards } from "../lib/eligibility-score-guards";
import type { EligibilityResult } from "../lib/claude";

const profile = {
  location: "Bristol, UK",
  sector: "technology",
  fundingPurposes: ["prototype development", "product development"],
  employeeCount: null,
  annualRevenue: null,
  yearEstablished: null,
  businessType: "startup",
};

const strongBase: EligibilityResult = {
  decision: "likely_eligible",
  reason: "Strong fit.",
  confidence: 88,
  score: 88,
  summary: "Strong fit.",
  reasons: ["UK based", "Technology fit", "Prototype development fit"],
  alignment: ["Matches prototype development"],
  met: ["UK registered company", "Technology sector"],
  missing: ["Company registration age not provided", "Revenue data minimal and unclear"],
  winProbability: 82,
  evidenceStrength: "strong",
};

const broadGrant = {
  name: "Prototype Accelerator",
  eligibility: "Open to UK start-ups and SMEs developing scalable technology products.",
  description: "Supports prototype development and commercial validation.",
  objectives: "Help technology start-ups develop products.",
  applicantTypes: ["Startup", "SME"],
  sectors: ["Technology"],
  regions: ["UK"],
};

const guardedBroad = applyEligibilityScoreGuards(profile, broadGrant, strongBase);
assert.equal(
  guardedBroad.score,
  88,
  "Soft age/revenue profile warnings must not cap a high score when the grant has no explicit threshold."
);

const revenueGrant = {
  ...broadGrant,
  eligibility: "Open to UK technology SMEs with at least GBP 250,000 annual revenue.",
};
const guardedRevenue = applyEligibilityScoreGuards(profile, revenueGrant, strongBase);
assert.equal(
  guardedRevenue.score,
  60,
  "Missing revenue must cap confidence when the funder states an explicit revenue threshold."
);

const purposeMismatch = applyEligibilityScoreGuards(profile, {
  ...broadGrant,
  eligibility: "Open to UK heritage organisations preserving local archives.",
  description: "Supports conservation planning, cataloguing, and public heritage access.",
  objectives: "Fund heritage conservation and archive cataloguing projects.",
  sectors: ["Heritage"],
}, strongBase);
assert.equal(
  purposeMismatch.score,
  60,
  "Real sector/purpose mismatch should still cap the score."
);

const genericProfile = {
  ...profile,
  fundingPurposes: [],
};

const weakGenericHighScore = applyEligibilityScoreGuards(genericProfile, {
  name: "Good Local Business Award",
  eligibility: "Open to small businesses based in the UK.",
  description: "Recognises local trading businesses with a positive community story.",
  objectives: "Celebrate local business resilience and community contribution.",
  applicantTypes: ["Business", "SME"],
  sectors: [],
  regions: ["UK"],
}, {
  ...strongBase,
  score: 85,
  confidence: 85,
  reason: "Biz Boosters is a strong candidate because it is a UK SME.",
  summary: "Biz Boosters is a strong candidate because it is a UK SME.",
  reasons: ["UK based", "SME"],
  met: ["UK based", "SME"],
});
assert.equal(
  weakGenericHighScore.score,
  70,
  "Generic UK SME eligibility alone should not stay in Suggested without clear sector or funding-purpose alignment."
);

console.log("Eligibility score guard tests passed");
