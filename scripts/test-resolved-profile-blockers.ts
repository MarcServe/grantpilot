import assert from "node:assert/strict";
import { isResolvedProfileBlocker, reconcileProfileBlockers, reconcileEligibilityDisplay } from "../lib/resolved-profile-blockers";
const profile = { incorporationDate: "2021-05-12", employeeCount: 0 };
assert.equal(isResolvedProfileBlocker("Company incorporation date not provided", profile), true);
assert.equal(isResolvedProfileBlocker("Confirm incorporation date", profile), true);
assert.equal(isResolvedProfileBlocker("Company incorporation date not provided", {}), false);
assert.equal(isResolvedProfileBlocker("Company incorporation date not provided", { incorporationDate: "invalid" }), false);
assert.equal(isResolvedProfileBlocker("Employee count missing", profile), true);
assert.equal(isResolvedProfileBlocker("Confirm incorporation date before 2020", profile), false);
assert.equal(isResolvedProfileBlocker("Missing incorporation certificate", profile), false);
assert.equal(isResolvedProfileBlocker("Legal structure and incorporation date missing", profile), false);
assert.equal(isResolvedProfileBlocker("Company age must be under 3 years", profile), false);
const result = reconcileProfileBlockers(profile, { score: 65, missing_criteria: ["Company incorporation date not provided", "Partner evidence required"], improvement_plan: { gaps: ["Company incorporation date not provided"], actions: ["Confirm incorporation date"] } });
assert.equal(result.resolved, true);
assert.deepEqual(result.assessment.missing, ["Partner evidence required"]);
assert.deepEqual(result.assessment.improvementPlan?.actions, []);
assert.equal(result.assessment.score, 65);
console.log("Resolved profile blocker checks passed");

const complete = { incorporationDate: "2021-05-12", legalStructure: "Limited company" };
const detail = reconcileEligibilityDisplay(complete, {
  decision: "likely_eligible", confidence: 85, score: 85, reason: "Cached assessment", summary: "Old profile details",
  missing: ["Company incorporation date not provided", "Year established not provided", "Legal structure not specified", "Independent audit evidence required"],
});
assert.deepEqual(detail.missing, ["Independent audit evidence required"]);
assert.equal(detail.assessmentRefreshPending, true);
assert.equal(detail.score, 85, "display reconciliation cannot increase a score");
assert.equal(detail.decision, "likely_eligible");
assert.equal(reconcileEligibilityDisplay(complete, { decision: "review", confidence: 50, missing: ["Company must be under 3 years old"], reason: "Age restriction" }).assessmentRefreshPending, false);

assert.equal(isResolvedProfileBlocker("Company age and year established data", complete, true), true);
assert.equal(isResolvedProfileBlocker("Company age and year established details", complete, true), true);
assert.equal(isResolvedProfileBlocker("Company age and year established data", {}, true), false);
assert.equal(isResolvedProfileBlocker("Company age and year established data", complete), false, "plain narrative is not a missing-field assertion");
assert.equal(isResolvedProfileBlocker("Company age evidence required", complete, true), false);
assert.equal(isResolvedProfileBlocker("Company must have traded for at least 3 years", complete, true), false);
assert.deepEqual(reconcileProfileBlockers(complete, { missing_criteria: ["Company age and year established data"], improvement_plan: { gaps: ["Missing company age and year established information"], actions: ["Provide evidence of registration"] } }).assessment.missing, []);
