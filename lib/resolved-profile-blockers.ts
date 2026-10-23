import type { EligibilityResult } from "@/lib/claude";
import type { EligibilityAssessmentLike } from "@/lib/eligibility-final-score";

const FIELDS = [
  { pattern: /incorporation date|date of incorporation/i, key: "incorporationDate" },
  { pattern: /trading start date|start of trading/i, key: "tradingStartDate" },
  { pattern: /year established|year of establishment/i, key: "yearEstablished" },
  { pattern: /legal structure/i, key: "legalStructure" },
  { pattern: /employee count|headcount/i, key: "employeeCount" },
  { pattern: /annual revenue|annual turnover/i, key: "annualRevenue" },
];

/** Remove only missing-value claims. Supplying a date does not prove an age rule. */
export function isResolvedProfileBlocker(text: string, profile: Record<string, unknown>): boolean {
  if (!/not provided|not supplied|not recorded|missing|unknown|not specified|not available|\b(add|provide|enter|confirm)\b/i.test(text)) return false;
  if (/\d|must|at least|at most|younger|older|before|after|exceed|ineligible|not eligible|evidence|certificate|verification|does not meet|mismatch/i.test(text)) return false;
  const fields = FIELDS.filter(field => field.pattern.test(text));
  return fields.length > 0 && fields.every(field => {
    const value = profile[field.key] ?? profile[field.key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)];
    if (field.key === "yearEstablished" && value == null) {
      const date = profile.incorporationDate ?? profile.incorporation_date;
      return typeof date === "string" && date.trim() !== "" && Number.isFinite(Date.parse(date));
    }
    if (field.key.endsWith("Date")) return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
    if (typeof value === "number") return Number.isFinite(value) && value >= 0;
    return typeof value === "string" && value.trim() !== "" && !/^(unknown|not sure|not provided|prefer not to say)$/i.test(value.trim());
  });
}

export function reconcileProfileBlockers(profile: Record<string, unknown>, assessment: EligibilityAssessmentLike) {
  let resolved = false;
  const filter = (values: string[] | null | undefined) => values?.filter(value => {
    if (!isResolvedProfileBlocker(value, profile)) return true;
    resolved = true;
    return false;
  });
  const missing = filter(assessment.missing ?? assessment.missing_criteria);
  const reasons = filter(assessment.reasons);
  const plan = assessment.improvement_plan ?? assessment.improvementPlan;
  const improvementPlan = plan ? { ...plan, gaps: filter(plan.gaps) ?? [], actions: filter(plan.actions) ?? [] } : plan;
  const summaryResolved = isResolvedProfileBlocker(assessment.summary ?? "", profile);
  resolved ||= summaryResolved;
  const summary = resolved
    ? "Profile information has been updated. The previous eligibility score is retained until reassessment; review the remaining requirements before applying."
    : assessment.summary;
  return { assessment: { ...assessment, reasons, reason: resolved ? summary ?? assessment.reason : assessment.reason, missing, missing_criteria: missing, improvementPlan, improvement_plan: improvementPlan, summary }, resolved };
}

/** Detail-page and API display use the same reconciliation without changing scores. */
export function reconcileEligibilityDisplay(profile: Record<string, unknown>, result: EligibilityResult) {
  const reconciled = reconcileProfileBlockers(profile, result);
  return {
    ...result,
    missing: reconciled.assessment.missing ?? [],
    reasons: reconciled.assessment.reasons ?? [],
    reason: reconciled.assessment.reason ?? result.reason,
    improvementPlan: reconciled.assessment.improvementPlan ?? undefined,
    summary: reconciled.assessment.summary ?? result.summary,
    assessmentRefreshPending: reconciled.resolved,
  };
}
