import assert from "node:assert/strict";

process.env.ELIGIBILITY_DEEP_SCORE_MIN_PROFILE_COMPLETION = "50";

async function main() {
  const { deepScoreProfilePriority, profileQualifiesForDeepScoring } = await import(
    "../lib/eligibility-deep-score-queue"
  );

  const completeProfile = {
    id: "profile-complete",
    businessName: "Biz Boosters Limited",
    sector: "AI technology",
    description: "Builds AI tools for SMEs.",
    location: "London, UK",
    completionScore: 91,
  };

  const blankProfile = {
    id: "profile-blank",
    businessName: "",
    sector: "",
    description: "",
    completionScore: 100,
  };

  const incompleteProfile = {
    id: "profile-incomplete",
    businessName: "NewCo",
    sector: "Technology",
    completionScore: 30,
  };

  const now = new Date();
  const activeTrialCreatedAt = new Date(now);
  activeTrialCreatedAt.setDate(activeTrialCreatedAt.getDate() - 2);

  const expiredTrialCreatedAt = new Date(now);
  expiredTrialCreatedAt.setDate(expiredTrialCreatedAt.getDate() - 12);

  assert.equal(
    profileQualifiesForDeepScoring(completeProfile, { plan: "BUSINESS", createdAt: now }),
    true,
    "complete paid profiles should qualify for deep scoring"
  );

  assert.ok(
    (deepScoreProfilePriority(completeProfile, { plan: "BUSINESS", createdAt: now }) ?? 0) >
      (deepScoreProfilePriority(completeProfile, { plan: "GROWTH", createdAt: now }) ?? 0),
    "higher paid plans should receive higher queue priority"
  );

  assert.equal(
    profileQualifiesForDeepScoring(completeProfile, { plan: "FREE_TRIAL", createdAt: activeTrialCreatedAt }),
    true,
    "complete active-trial profiles should qualify"
  );

  assert.equal(
    profileQualifiesForDeepScoring(completeProfile, { plan: "FREE_TRIAL", createdAt: expiredTrialCreatedAt }),
    false,
    "expired-trial profiles should not consume platform deep-scoring"
  );

  assert.equal(
    profileQualifiesForDeepScoring(blankProfile, { plan: "BUSINESS", createdAt: now }),
    false,
    "blank profiles should not consume platform deep-scoring"
  );

  assert.equal(
    profileQualifiesForDeepScoring(incompleteProfile, { plan: "BUSINESS", createdAt: now }),
    false,
    "low-completion profiles should not consume platform deep-scoring"
  );

  console.log("deep-score profile priority tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
