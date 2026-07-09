import type { EligibilityResult } from "@/lib/claude";
import { applyEligibilityScoreGuards } from "@/lib/eligibility-score-guards";
import { applyOutcomeScoreAdjustment, type OutcomeLearningAdvisory } from "@/lib/outcome-learning";

export type EligibilityAssessmentLike = {
  score?: number | null;
  confidence?: number | null;
  decision?: string | null;
  summary?: string | null;
  reason?: string | null;
  reasons?: string[] | null;
  missing?: string[] | null;
  met?: string[] | null;
  missing_criteria?: string[] | null;
  improvementPlan?: EligibilityResult["improvementPlan"] | null;
  improvement_plan?: EligibilityResult["improvementPlan"] | null;
  scoring_source?: string | null;
};

export type EligibilityGuardGrant = {
  name?: string | null;
  deadline?: string | Date | null;
  url_status?: string | null;
  urlStatus?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[];
  sectors?: string[];
  regions?: string[];
};

export function profileForEligibilityGuards(profile: Record<string, unknown>) {
  return {
    businessName: String(profile.businessName ?? profile.business_name ?? ""),
    description: String(profile.description ?? ""),
    missionStatement: String(profile.missionStatement ?? profile.mission_statement ?? ""),
    fundingDetails: String(profile.fundingDetails ?? profile.funding_details ?? ""),
    location: String(profile.location ?? ""),
    sector: String(profile.sector ?? ""),
    fundingPurposes: Array.isArray(profile.fundingPurposes)
      ? (profile.fundingPurposes as string[])
      : Array.isArray(profile.funding_purposes)
        ? (profile.funding_purposes as string[])
        : [],
    businessType: String(profile.businessType ?? profile.business_type ?? "") || null,
    employeeCount:
      profile.employeeCount != null
        ? Number(profile.employeeCount)
        : profile.employee_count != null
          ? Number(profile.employee_count)
          : null,
    annualRevenue:
      profile.annualRevenue != null
        ? Number(profile.annualRevenue)
        : profile.annual_revenue != null
          ? Number(profile.annual_revenue)
          : null,
    yearEstablished:
      profile.yearEstablished != null
        ? Number(profile.yearEstablished)
        : profile.year_established != null
          ? Number(profile.year_established)
          : null,
  };
}

export function resolveScoringSource(assessment: EligibilityAssessmentLike): string {
  return assessment.scoring_source ?? (assessment.summary?.startsWith("Preliminary fit") ? "heuristic" : "openai");
}

function normaliseDecision(value: string | null | undefined, score: number): EligibilityResult["decision"] {
  if (value === "likely_eligible" || value === "review" || value === "unlikely") return value;
  if (score >= 70) return "likely_eligible";
  if (score >= 40) return "review";
  return "unlikely";
}

export function finaliseEligibilityAssessment(
  profile: Record<string, unknown>,
  grant: EligibilityGuardGrant,
  assessment: EligibilityAssessmentLike,
  outcomeAdvisory: OutcomeLearningAdvisory
): EligibilityResult {
  const rawScore = Number(assessment.score ?? assessment.confidence ?? 0);
  const safeScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
  const scoringSource = resolveScoringSource(assessment);
  const baseScore = scoringSource === "heuristic" ? Math.min(safeScore, 69) : safeScore;
  const improvementPlan = assessment.improvement_plan ?? assessment.improvementPlan ?? undefined;
  const missing = assessment.missing ?? assessment.missing_criteria ?? [];

  return applyOutcomeScoreAdjustment(
    applyEligibilityScoreGuards(profileForEligibilityGuards(profile), grant, {
      decision: normaliseDecision(assessment.decision, baseScore),
      reason: assessment.reason ?? assessment.summary ?? "",
      confidence: baseScore,
      score: baseScore,
      summary: assessment.summary ?? undefined,
      reasons: assessment.reasons ?? [],
      improvementPlan,
      met: assessment.met ?? [],
      missing,
      winProbability: baseScore,
      evidenceStrength: baseScore >= 80 ? "strong" : baseScore >= 55 ? "medium" : "weak",
    }),
    outcomeAdvisory
  );
}

export function finalEligibilityScore(result: EligibilityResult): number {
  const score = Number(result.score ?? result.confidence ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
}
