import { z } from "zod";

export const CRITERIA_VERSION = 1;
export const factFields = [
  "employeeCount",
  "annualRevenue",
  "incorporationDate",
  "tradingStartDate",
  "legalStructure",
  "businessStage",
  "businessSizeBand",
  "location",
  "localAuthority",
  "sector",
  "coFundingAvailable",
  "fundingDetails",
  "previousGrantExperience",
] as const;
export const criterionSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(1000),
  category: z.enum([
    "size",
    "stage",
    "legal",
    "geography",
    "financial",
    "project",
    "other",
  ]),
  mandatory: z.boolean(),
  alternativeGroup: z.string().nullable(),
  field: z.enum(factFields).nullable(),
  operator: z.enum([
    "gte",
    "lte",
    "lt",
    "gt",
    "one_of",
    "date_before",
    "date_after",
    "confirm",
  ]),
  expected: z.union([z.number(), z.string(), z.array(z.string())]).nullable(),
  excerpt: z.string().min(1).max(3000),
  question: z.string().min(1).max(1000),
});
export type Criterion = z.infer<typeof criterionSchema>;
export type CriteriaDocument = {
  version: number;
  sourceVersion: string;
  sourceUrl: string;
  extractedAt: string;
  coverage: "complete" | "partial" | "unavailable";
  criteria: Criterion[];
  objectives: string[];
  workload: {
    id: string;
    label: string;
    kind: "question" | "document" | "budget";
    excerpt: string;
  }[];
  terms: { label: string; value: string; excerpt: string }[];
  error?: string;
};
export type CriterionStatus =
  "met" | "needs_information" | "not_met" | "not_applicable";
export type CriterionAnswer = {
  value: boolean;
  evidence: string;
  sourceVersion: string;
  factValue?: string | number | null;
};
export type CriterionResult = Criterion & {
  status: CriterionStatus;
  explanation: string;
  actual: string | number | null;
  sourceUrl: string;
  sourceVersion: string;
};
export type CriteriaAssessment = {
  version: number;
  sourceVersion: string;
  coverage: CriteriaDocument["coverage"];
  criteria: CriterionResult[];
  counts: Record<CriterionStatus, number>;
  strongEligible: boolean;
  summary: string;
};

function normalise(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}
function fieldValue(profile: Record<string, unknown>, field: string): unknown {
  return (
    profile[field] ??
    profile[field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)]
  );
}
function exactNumber(value: unknown): number | null {
  if (
    (typeof value === "string" && !value.trim()) ||
    value == null ||
    typeof value === "boolean"
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function assessCriteria(
  document: CriteriaDocument,
  profile: Record<string, unknown>,
  answers: Record<string, CriterionAnswer> = {},
): CriteriaAssessment {
  const criteria: CriterionResult[] = document.criteria.map((c) => {
    const raw = c.field ? fieldValue(profile, c.field) : null;
    const actual =
      typeof raw === "number" || typeof raw === "string" ? raw : null;
    let status: CriterionStatus = "needs_information";
    let explanation =
      actual == null || actual === ""
        ? c.question
        : `Saved answer: ${actual}. Confirm it against this requirement.`;
    const numeric = exactNumber(actual);
    if (
      ["gte", "lte", "lt", "gt"].includes(c.operator) &&
      numeric != null &&
      typeof c.expected === "number"
    ) {
      const match =
        c.operator === "gte"
          ? numeric >= c.expected
          : c.operator === "lte"
            ? numeric <= c.expected
            : c.operator === "lt"
              ? numeric < c.expected
              : numeric > c.expected;
      status = match ? "met" : "not_met";
      explanation = `Saved ${c.field}: ${actual}; requirement: ${c.label}`;
    } else if (
      ["date_before", "date_after"].includes(c.operator) &&
      typeof actual === "string" &&
      typeof c.expected === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(actual) &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.expected)
    ) {
      status = (
        c.operator === "date_before"
          ? actual <= c.expected
          : actual >= c.expected
      )
        ? "met"
        : "not_met";
      explanation = `Saved ${c.field}: ${actual}; requirement: ${c.label}`;
    } else if (
      c.operator === "one_of" &&
      Array.isArray(c.expected) &&
      actual != null &&
      normalise(actual)
    ) {
      // Only exact known matches are automatic. Semantic differences are not failures.
      if (c.expected.some((v) => normalise(v) === normalise(actual))) {
        status = "met";
        explanation = `Saved ${c.field}: ${actual}`;
      }
    }
    const answer = answers[c.id];
    // Confirmation never overrides a measured failure, and expires when the source changes.
    if (
      status === "needs_information" &&
      answer?.sourceVersion === document.sourceVersion &&
      (!c.field || answer.factValue === actual) &&
      answer.evidence.trim()
    ) {
      status = answer.value ? "met" : "not_met";
      explanation = `Confirmed by you: ${answer.evidence}`;
    }
    return {
      ...c,
      status,
      explanation,
      actual,
      sourceUrl: document.sourceUrl,
      sourceVersion: document.sourceVersion,
    };
  });
  const satisfiedGroups = new Set(
    criteria
      .filter((c) => c.alternativeGroup && c.status === "met")
      .map((c) => c.alternativeGroup),
  );
  for (const c of criteria)
    if (
      c.alternativeGroup &&
      satisfiedGroups.has(c.alternativeGroup) &&
      c.status !== "met"
    ) {
      c.status = "not_applicable";
      c.explanation =
        "Another permitted alternative in this requirement is met.";
    }
  const counts = {
    met: 0,
    needs_information: 0,
    not_met: 0,
    not_applicable: 0,
  };
  criteria.forEach((c) => counts[c.status]++);
  const extracted = Date.parse(document.extractedAt);
  const sourceCurrent =
    document.version === CRITERIA_VERSION &&
    Number.isFinite(extracted) &&
    Date.now() - extracted >= -60_000 &&
    Date.now() - extracted <= 7 * 86400000;
  const coverage = sourceCurrent ? document.coverage : "unavailable";
  const strongEligible =
    coverage === "complete" &&
    criteria.length > 0 &&
    criteria.every(
      (c) =>
        !c.mandatory || c.status === "met" || c.status === "not_applicable",
    );
  const summary = strongEligible
    ? "All reviewed published eligibility requirements confirmed. This is not a funding award guarantee."
    : `${counts.met} met · ${counts.needs_information} need information · ${counts.not_met} not met${coverage !== "complete" ? " · Source review incomplete" : ""}`;
  return {
    version: CRITERIA_VERSION,
    sourceVersion: document.sourceVersion,
    coverage,
    criteria,
    counts,
    strongEligible,
    summary,
  };
}

export function missingFactImpact(
  assessments: { grantId: string; assessment: CriteriaAssessment }[],
) {
  const fields = new Map<string, Set<string>>();
  for (const { grantId, assessment } of assessments)
    for (const c of assessment.criteria)
      if (c.field && c.status === "needs_information") {
        if (!fields.has(c.field)) fields.set(c.field, new Set());
        fields.get(c.field)!.add(grantId);
      }
  return [...fields]
    .map(([field, grants]) => ({ field, count: grants.size }))
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));
}
export function unavailableCriteria(): CriteriaDocument {
  return {
    version: CRITERIA_VERSION,
    sourceVersion: "unverified",
    sourceUrl: "",
    extractedAt: "",
    coverage: "unavailable",
    criteria: [],
    objectives: [],
    workload: [],
    terms: [],
  };
}
