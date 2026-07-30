import assert from "assert";
import { estimateGrantEffort } from "@/lib/grant-effort";

const directQuick = estimateGrantEffort({
  amount: 40_000,
  deadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
  applicationUrlQuality: "verified_direct",
  score: 90,
  description: "Short application for SME innovation projects.",
});

assert.equal(directQuick.effortBand, "Quick win");
assert.equal(directQuick.priorityLabel, "Apply today");
assert.ok(directQuick.opportunityScore >= 70);

const complexGrantPage = estimateGrantEffort({
  amount: 500_000,
  deadline: new Date(Date.now() + 80 * 86_400_000).toISOString(),
  applicationUrlQuality: "grant_page",
  score: 62,
  eligibility:
    "Collaborative research and development grant requiring academic partners, match funding, work packages, budget narrative, monitoring and evaluation.",
  missingCriteria: ["Partner letter", "Financial statements"],
});

assert.equal(complexGrantPage.effortBand, "Strategic");
assert.ok(complexGrantPage.estimatedMinutes > directQuick.estimatedMinutes);
assert.notEqual(complexGrantPage.priorityLabel, "Apply today");

const noAmountMedium = estimateGrantEffort({
  amount: null,
  applicationUrlQuality: "verified_portal",
  score: 74,
  description: "Business support grant with standard eligibility questions.",
});

assert.equal(noAmountMedium.roatLabel, "Medium");
assert.ok(noAmountMedium.estimatedTimeLabel.length > 0);

console.log("grant effort tests passed");
