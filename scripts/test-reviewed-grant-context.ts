import assert from "node:assert/strict";
import { appendPublishedRequirements, guardPublishedAssessment } from "../lib/reviewed-grant-context";
import { extractCriteriaDocument } from "../lib/criteria-source";
import { grantContentHashForEligibility, profileHashForEligibility } from "../lib/eligibility-ai-cache";
import { sourceReviewErrorMessage } from "../lib/source-review-errors";
import { assessCriteria } from "../lib/criteria";
import { profileProjectEvidence } from "../lib/profile-project-evidence";
import { profileToMatching } from "../lib/profile-for-matching";
import type { CriteriaDocument } from "../lib/criteria";
import type { EligibilityResult } from "../lib/claude";

async function main() {
  const text = "Only businesses with fewer than 10 employees may apply. " + "General guidance. ".repeat(200) + "Routine integration is excluded. Question 9: Describe your novel architecture. Maximum 800 words.";
  const model = { coverage: "complete", criteria: [{ label: "Under 10 employees", category: "size", mandatory: true, alternativeGroup: null, field: "employeeCount", operator: "lt", expected: 10, excerpt: "fewer than 10 employees", question: "How many employees?" }], objectives: [], workload: [{ label: "Question 9", kind: "question", excerpt: "Describe your novel architecture. Maximum 800 words.", wordLimit: 800 }], terms: [] };
  const fetchSource = async () => ({ url: "https://example.org/guidance", text, unreviewedLinks: ["https://example.org/assessor.pdf"] });
  const doc = await extractCriteriaDocument("https://example.org/guidance", "Test", { fetchSource, complete: async () => JSON.stringify(model) });
  assert.equal(doc.coverage, "partial", "unread PDF prevents complete coverage");
  // Reproduce the production response: the model invents fields outside the schema.
  const unsupported = ["projectDurationMonths", "projectCost", "technicalReadinessLevel", "subcontractorsAllowed"];
  const flexible = await extractCriteriaDocument("https://example.org/guidance", "Test", {
    fetchSource,
    complete: async (prompt) => {
      assert.match(prompt, /Never invent field names/);
      return JSON.stringify({ ...model, criteria: unsupported.map(field => ({ ...model.criteria[0], label: field, field, operator: "lte", expected: 3 })) });
    },
  });
  assert.equal(flexible.criteria.length, unsupported.length, "do not drop unsupported requirements");
  for (const criterion of flexible.criteria) { assert.equal(criterion.field, null); assert.equal(criterion.operator, "confirm"); assert.equal(criterion.expected, null); assert.equal(criterion.excerpt, "fewer than 10 employees"); }
  assert.equal(assessCriteria(flexible, { employeeCount: 3 }).counts.needs_information, unsupported.length, "unknown facts never become automatic passes");
  const dates = await extractCriteriaDocument("https://example.org/guidance", "Test", { fetchSource, complete: async () => JSON.stringify({ ...model, criteria: [{ ...model.criteria[0], field: "projectStartDate", operator: "date_before", expected: "2027-04-02" }, { ...model.criteria[0], field: "projectEndDate", operator: "date_before", expected: "2027-07-01" }] }) });
  assert.equal(assessCriteria(dates, { projectStartDate: "2027-04-01", projectEndDate: "2027-06-30" }).counts.met, 2);
  const repaired = await extractCriteriaDocument("https://example.org/guidance", "Test", { fetchSource, complete: async () => JSON.stringify({ ...model, criteria: [{ ...model.criteria[0], category: "unsupported-category" }] }) });
  assert.equal(repaired.criteria.length, 1); assert.equal(repaired.criteria[0].operator, "confirm"); assert.equal(repaired.coverage, "partial");
  const publicError = sourceReviewErrorMessage(new Error('[{"code":"invalid_enum_value","received":"projectDurationMonths"}]'));
  assert.ok(publicError.length < 250); assert.doesNotMatch(publicError, /invalid_enum|projectDurationMonths/);
  assert.equal(sourceReviewErrorMessage(publicError), publicError, "client keeps the safe server explanation");

  assert.equal(doc.workload[0].wordLimit, 800);
  assert.equal(doc.sourceText, text);
  assert.ok(appendPublishedRequirements("Summary", new Map([["g", doc]])).includes("Routine integration is excluded."));
  assert.throws(() => appendPublishedRequirements("", new Map([["g", { ...doc, sourceText: "x".repeat(200001) }]])), /too long/);
  const unverified = await extractCriteriaDocument("https://example.org/guidance", "Test", { fetchSource, complete: async () => JSON.stringify({ ...model, workload: [{ ...model.workload[0], excerpt: "Invented published guidance" }] }) });
  assert.equal(unverified.workload.length, 0, "unverified quotes must not enter preparation"); assert.equal(unverified.criteria.length, 1, "retain valid siblings"); assert.equal(unverified.coverage, "partial");
  const result: EligibilityResult = { confidence: 85, score: 85, decision: "likely_eligible", reason: "Sector fit", summary: "Sector fit", met: [], missing: [] };
  const complete: CriteriaDocument = { ...doc, coverage: "complete", unreviewedLinks: [] };
  assert.equal(guardPublishedAssessment(result, complete, { employeeCount: 3 }).score, 85);
  assert.equal(guardPublishedAssessment(result, complete, {}).score, 69);
  assert.equal(guardPublishedAssessment(result, complete, { employeeCount: 10 }).score, 39);
  assert.equal(guardPublishedAssessment(result, doc, { employeeCount: 3 }).decision, "review");
  assert.equal(guardPublishedAssessment(result, { ...complete, extractedAt: "2020-01-01" }, { employeeCount: 3 }).decision, "review");
  assert.notEqual(grantContentHashForEligibility({ description: text }), grantContentHashForEligibility({ description: text + " Another exclusion." }), "late source changes invalidate AI cache");
  const profile = { businessName: "Test", projectSummary: "Novel architecture" };
  assert.notEqual(profileHashForEligibility(profile), profileHashForEligibility({ ...profile, projectSummary: "Existing tool integration" }));
  const normalized = profileToMatching(profile);
  assert.equal(normalized.projectEvidence, profileProjectEvidence(profile), "raw and matching project evidence stays identical");
  console.log("Reviewed source extraction, quotes, limits, scope preservation, score guards, freshness and cache tests passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
