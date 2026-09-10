import assert from "node:assert/strict";
import {
  assessCriteria,
  missingFactImpact,
  type CriteriaDocument,
  type Criterion,
} from "../lib/criteria";
import {
  resolveGrantFundingValue,
  comparableAwardAverages,
} from "../lib/grant-value";
import { isResearchResource } from "../lib/grant-actionability";
import {
  profileCompletionFields,
  firstIncompleteProfileStep,
} from "../lib/profile-completion";
const criterion: Criterion = {
  id: "employees",
  label: "Fewer than 10 employees",
  category: "size",
  mandatory: true,
  alternativeGroup: null,
  field: "employeeCount",
  operator: "lt",
  expected: 10,
  excerpt: "Fewer than 10 employees",
  question: "How many employees?",
};
const document: CriteriaDocument = {
  version: 1,
  sourceVersion: "source-1",
  sourceUrl: "https://example.org/grant",
  extractedAt: new Date().toISOString(),
  coverage: "complete",
  criteria: [criterion],
  objectives: [],
  workload: [],
  terms: [],
};
assert.equal(
  assessCriteria(document, { employeeCount: 3 }).strongEligible,
  true,
);
assert.equal(
  assessCriteria(document, { employeeCount: 10 }).criteria[0].status,
  "not_met",
  "strict upper threshold excludes boundary",
);
assert.equal(
  assessCriteria(document, {}).criteria[0].status,
  "needs_information",
);
assert.equal(
  assessCriteria(document, { employeeCount: 0 }).criteria[0].status,
  "met",
  "zero employees is a known fact",
);
assert.equal(
  assessCriteria(
    document,
    { employeeCount: 50 },
    {
      employees: {
        value: true,
        evidence: "Yes",
        sourceVersion: "source-1",
        factValue: 50,
      },
    },
  ).strongEligible,
  false,
  "self confirmation cannot override failed measurement",
);
const semantic = {
  ...document,
  criteria: [
    {
      ...criterion,
      id: "project",
      field: "fundingDetails" as const,
      operator: "confirm" as const,
    },
  ],
};
assert.equal(
  assessCriteria(
    semantic,
    { fundingDetails: "old" },
    {
      project: {
        value: true,
        evidence: "Project evidence",
        sourceVersion: "source-1",
        factValue: "old",
      },
    },
  ).counts.met,
  1,
);
assert.equal(
  assessCriteria(
    semantic,
    { fundingDetails: "changed" },
    {
      project: {
        value: true,
        evidence: "Project evidence",
        sourceVersion: "source-1",
        factValue: "old",
      },
    },
  ).counts.needs_information,
  1,
  "changed facts invalidate confirmation",
);
assert.equal(
  assessCriteria(
    semantic,
    { fundingDetails: "old" },
    {
      project: {
        value: true,
        evidence: "Project evidence",
        sourceVersion: "source-0",
        factValue: "old",
      },
    },
  ).counts.needs_information,
  1,
  "changed source invalidates confirmation",
);
const alternatives = {
  ...document,
  criteria: [
    {
      ...criterion,
      id: "startup",
      field: "businessStage" as const,
      operator: "one_of" as const,
      expected: ["Startup"],
      alternativeGroup: "stage",
    },
    {
      ...criterion,
      id: "scaleup",
      field: "businessStage" as const,
      operator: "one_of" as const,
      expected: ["Scaleup"],
      alternativeGroup: "stage",
    },
  ],
};
const either = assessCriteria(alternatives, { businessStage: "Startup" });
assert.equal(either.strongEligible, true);
assert.equal(either.counts.not_applicable, 1);
assert.equal(
  assessCriteria({ ...document, coverage: "partial" }, { employeeCount: 3 })
    .strongEligible,
  false,
);
assert.equal(
  assessCriteria(
    { ...document, extractedAt: "2020-01-01" },
    { employeeCount: 3 },
  ).strongEligible,
  false,
  "stale source cannot qualify as strong",
);
const uncertain = assessCriteria(document, {});
assert.deepEqual(
  missingFactImpact([
    { grantId: "a", assessment: uncertain },
    { grantId: "a", assessment: uncertain },
    { grantId: "b", assessment: uncertain },
  ]),
  [{ field: "employeeCount", count: 2 }],
  "impact counts distinct opportunities",
);
assert.equal(
  resolveGrantFundingValue({ amount: 500_000_000 }).countsTowardApplicantTotal,
  false,
);
assert.equal(resolveGrantFundingValue({ amount: 500_000_000 }).amount, null);
assert.equal(
  resolveGrantFundingValue({ programmeTotalAmount: 500_000_000 })
    .countsTowardApplicantTotal,
  false,
);
assert.equal(
  resolveGrantFundingValue({
    fundingValue: {
      type: "programme_total",
      amount: 500000,
      label: "Fund",
      countsTowardApplicantTotal: true,
    },
  }).countsTowardApplicantTotal,
  false,
);
assert.deepEqual(
  comparableAwardAverages([
    { applicantMaxAmount: 100, currency: "GBP", opportunityType: "grant" },
    { applicantMaxAmount: 300, currency: "GBP", opportunityType: "grant" },
    { applicantMaxAmount: 1000, currency: "USD", opportunityType: "grant" },
    { applicantMaxAmount: 2000, currency: "GBP", opportunityType: "loan" },
    { amount: 900000, currency: "GBP", opportunityType: "grant" },
    { applicantMaxAmount: 999, opportunityType: "grant" },
  ]).map((g) => [g.currency, g.type, g.average, g.count]),
  [
    ["GBP", "grant", 200, 2],
    ["USD", "grant", 1000, 1],
    ["GBP", "loan", 2000, 1],
  ],
);
assert.equal(
  isResearchResource({ name: "Business Finance Support Finder" }),
  true,
);
assert.equal(
  isResearchResource({
    name: "Innovation Award",
    applicationUrlQualityReason: "Verified official funder application page",
  }),
  false,
);
assert.equal(
  profileCompletionFields({ employeeCount: 0, annualRevenue: 0 }).find(
    (f) => f.key === "employeeCount",
  )?.complete,
  true,
);
assert.equal(firstIncompleteProfileStep({}), 1);
console.log(
  "Criteria, source freshness, OR groups, evidence, values and profile completion tests passed",
);
