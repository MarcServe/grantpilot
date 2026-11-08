import assert from "node:assert/strict";
import { appendPublishedRequirements, guardPublishedAssessment } from "../lib/reviewed-grant-context";
import { extractCriteriaDocument } from "../lib/criteria-source";
import { grantContentHashForEligibility, profileHashForEligibility } from "../lib/eligibility-ai-cache";
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
  assert.equal(doc.workload[0].wordLimit, 800);
  assert.equal(doc.sourceText, text);
  assert.ok(appendPublishedRequirements("Summary", new Map([["g", doc]])).includes("Routine integration is excluded."));
  assert.throws(() => appendPublishedRequirements("", new Map([["g", { ...doc, sourceText: "x".repeat(200001) }]])), /too long/);
  await assert.rejects(() => extractCriteriaDocument("https://example.org/guidance", "Test", { fetchSource, complete: async () => JSON.stringify({ ...model, workload: [{ ...model.workload[0], excerpt: "Invented published guidance" }] }) }), /verify all evidence/);
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
