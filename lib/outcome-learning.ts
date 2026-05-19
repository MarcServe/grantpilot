import { completeJson, cleanJsonResponse } from "@/lib/openai-client";
import type { EligibilityResult } from "@/lib/claude";

export type FundingOutcome = "applied" | "shortlisted" | "awarded" | "rejected" | "withdrawn" | "unknown";

export interface OutcomeLearningInsight {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  nextActions: string[];
  scoringAdjustment: number;
}

export function outcomeToScoreSignal(outcome: FundingOutcome): number {
  switch (outcome) {
    case "awarded":
      return 20;
    case "shortlisted":
      return 12;
    case "applied":
      return 3;
    case "rejected":
      return -8;
    case "withdrawn":
      return -3;
    default:
      return 0;
  }
}

export async function generateOutcomeLearningInsight(input: {
  outcome: FundingOutcome;
  grantName: string;
  funder: string;
  profileSummary: string;
  funderFeedback?: string | null;
  learningNotes?: string | null;
}): Promise<OutcomeLearningInsight> {
  const raw = await completeJson(
    `You are analysing a grant application outcome so a funding intelligence system can improve future recommendations.

Grant: ${input.grantName}
Funder: ${input.funder}
Outcome: ${input.outcome}
Business profile summary:
${input.profileSummary}

Funder feedback:
${input.funderFeedback ?? "None provided"}

Founder notes:
${input.learningNotes ?? "None provided"}

Return ONLY valid JSON:
{
  "summary": "one paragraph on what this outcome teaches the system",
  "strengths": ["repeatable strength"],
  "weaknesses": ["gap or risk to improve"],
  "nextActions": ["specific action"],
  "scoringAdjustment": -20 to 20
}

Rules:
- Do not overfit to one outcome.
- Awarded and shortlisted outcomes should identify repeatable strengths.
- Rejected outcomes should identify likely gaps without assuming facts not provided.
- scoringAdjustment should be conservative: awarded 8-20, shortlisted 5-12, applied 0-5, rejected -12 to -3, withdrawn -5 to 0.`,
    1200
  );
  try {
    const parsed = JSON.parse(cleanJsonResponse(raw)) as Partial<OutcomeLearningInsight>;
    return {
      summary: String(parsed.summary ?? "").trim(),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).filter(Boolean) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String).filter(Boolean) : [],
      nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.map(String).filter(Boolean) : [],
      scoringAdjustment: Math.max(-20, Math.min(20, Number(parsed.scoringAdjustment ?? outcomeToScoreSignal(input.outcome)))),
    };
  } catch {
    return {
      summary: "Outcome recorded. Future scoring can use this as a funding signal once more outcomes are available.",
      strengths: [],
      weaknesses: [],
      nextActions: [],
      scoringAdjustment: outcomeToScoreSignal(input.outcome),
    };
  }
}

export function buildOutcomeProfileSummary(profile: Record<string, unknown>): string {
  const keys = [
    "businessName",
    "sector",
    "businessType",
    "location",
    "missionStatement",
    "description",
    "fundingDetails",
    "innovationCapabilities",
    "socialImpact",
    "teamExpertise",
    "keyAchievements",
  ];
  return keys
    .map((key) => `${key}: ${Array.isArray(profile[key]) ? (profile[key] as unknown[]).join(", ") : String(profile[key] ?? "")}`)
    .join("\n");
}

function parseStoredInsight(value?: string | null): OutcomeLearningInsight | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { insight?: Partial<OutcomeLearningInsight> | null };
    const insight = parsed.insight;
    if (!insight) return null;
    return {
      summary: String(insight.summary ?? "").trim(),
      strengths: Array.isArray(insight.strengths) ? insight.strengths.map(String).filter(Boolean) : [],
      weaknesses: Array.isArray(insight.weaknesses) ? insight.weaknesses.map(String).filter(Boolean) : [],
      nextActions: Array.isArray(insight.nextActions) ? insight.nextActions.map(String).filter(Boolean) : [],
      scoringAdjustment: Math.max(-20, Math.min(20, Number(insight.scoringAdjustment ?? 0))),
    };
  } catch {
    return null;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function decisionForScore(score: number): "likely_eligible" | "review" | "unlikely" {
  if (score >= 75) return "likely_eligible";
  if (score >= 40) return "review";
  return "unlikely";
}

export function buildFundingOutcomeSignals(outcomes: unknown[] | null): string {
  const rows = Array.isArray(outcomes) ? outcomes : [];
  if (rows.length === 0) return "";

  return rows
    .slice(0, 8)
    .map((row) => {
      const item = row as {
        outcome?: FundingOutcome;
        awardedAmount?: number | null;
        funderFeedback?: string | null;
        learningNotes?: string | null;
        Grant?: { name?: string; funder?: string } | { name?: string; funder?: string }[];
      };
      const grant = Array.isArray(item.Grant) ? item.Grant[0] : item.Grant;
      const insight = parseStoredInsight(item.learningNotes);
      const amount = item.awardedAmount ? `, awarded GBP ${Number(item.awardedAmount).toLocaleString("en-GB")}` : "";
      const feedback = item.funderFeedback ? `, funder feedback: ${item.funderFeedback.slice(0, 240)}` : "";
      const learning = insight
        ? [
            insight.summary ? `learning: ${insight.summary.slice(0, 320)}` : "",
            insight.weaknesses.length ? `gaps: ${insight.weaknesses.slice(0, 3).join("; ")}` : "",
            insight.nextActions.length ? `next actions: ${insight.nextActions.slice(0, 3).join("; ")}` : "",
            Number.isFinite(insight.scoringAdjustment) ? `scoring adjustment: ${insight.scoringAdjustment}` : "",
          ].filter(Boolean).join(", ")
        : "";
      return `${grant?.name ?? "Grant"} (${grant?.funder ?? "Funder"}): ${item.outcome ?? "unknown"}${amount}${feedback}${learning ? `, ${learning}` : ""}`;
    })
    .join("\n");
}

export function deriveOutcomeScoreAdjustment(outcomes: unknown[] | null): number {
  const rows = Array.isArray(outcomes) ? outcomes.slice(0, 8) : [];
  if (rows.length === 0) return 0;

  let weighted = 0;
  let totalWeight = 0;
  rows.forEach((row, index) => {
    const item = row as { outcome?: FundingOutcome; learningNotes?: string | null };
    const insight = parseStoredInsight(item.learningNotes);
    const rawAdjustment =
      insight && Number.isFinite(insight.scoringAdjustment)
        ? insight.scoringAdjustment
        : outcomeToScoreSignal(item.outcome ?? "unknown") * 0.5;
    if (!Number.isFinite(rawAdjustment) || rawAdjustment === 0) return;
    const weight = 1 / (index + 1);
    weighted += rawAdjustment * weight;
    totalWeight += weight;
  });

  if (totalWeight === 0) return 0;
  return Math.max(-10, Math.min(10, Math.round(weighted / totalWeight)));
}

export function applyOutcomeScoreAdjustment(
  result: EligibilityResult,
  adjustment: number
): EligibilityResult {
  if (!Number.isFinite(adjustment) || adjustment === 0) return result;
  const alreadyApplied = [
    result.summary ?? "",
    result.reason ?? "",
    ...(result.reasons ?? []),
  ].some((value) => value.includes("Outcome learning calibration"));
  if (alreadyApplied) return result;

  const currentScore = Math.max(0, Math.min(100, result.score ?? result.confidence));
  const adjustedRaw = currentScore + adjustment;
  const adjustedScore = Math.max(0, Math.min(100, adjustment > 0 && currentScore < 40 ? Math.min(adjustedRaw, 39) : adjustedRaw));
  if (adjustedScore === currentScore) return result;

  const label =
    adjustment < 0
      ? `Outcome learning calibration: recent funder outcomes apply a ${adjustment} score adjustment.`
      : `Outcome learning calibration: recent funder outcomes apply a +${adjustment} score adjustment.`;
  const action =
    adjustment < 0
      ? "Review recorded outcome feedback and resolve repeated eligibility gaps before prioritising this grant."
      : "Use the recorded strengths from previous successful outcomes when preparing this application.";

  return {
    ...result,
    decision: decisionForScore(adjustedScore),
    score: adjustedScore,
    confidence: adjustedScore,
    winProbability: Math.max(0, Math.min(100, (result.winProbability ?? currentScore) + adjustment)),
    evidenceStrength: adjustedScore >= 80 ? "strong" : adjustedScore >= 55 ? "medium" : "weak",
    reasons: unique([...(result.reasons ?? []), label]),
    missing: adjustment < 0 ? unique([...(result.missing ?? []), "Prior outcome feedback indicates qualification risk"]) : result.missing,
    improvementPlan:
      adjustedScore >= 75
        ? result.improvementPlan
        : {
            ...(result.improvementPlan ?? {}),
            gaps: adjustment < 0
              ? unique([...(result.improvementPlan?.gaps ?? []), "Prior outcome feedback indicates qualification risk"])
              : result.improvementPlan?.gaps,
            actions: unique([...(result.improvementPlan?.actions ?? []), action]),
            timeline: result.improvementPlan?.timeline ?? "Before applying",
          },
    summary: result.summary && result.summary.includes("Outcome learning calibration")
      ? result.summary
      : `${result.summary ?? result.reason ?? "Eligibility scored."} ${label}`,
    reason: result.reason && result.reason.includes("Outcome learning calibration")
      ? result.reason
      : `${result.reason ?? result.summary ?? "Eligibility scored."} ${label}`,
  };
}
