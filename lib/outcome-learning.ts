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

export interface OutcomeLearningAdvisory {
  signal: number;
  warnings: string[];
  strengths: string[];
  nextActions: string[];
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
- scoringAdjustment is stored only as an advisory signal for warnings and reporting. It must not be used as a hidden score penalty or boost.
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
      summary: "Outcome recorded. Future grant checks can show this as advisory context once more outcomes are available.",
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
            insight.summary ? `advisory learning: ${insight.summary.slice(0, 320)}` : "",
            insight.weaknesses.length ? `warnings to check before applying: ${insight.weaknesses.slice(0, 3).join("; ")}` : "",
            insight.nextActions.length ? `pre-application checks: ${insight.nextActions.slice(0, 3).join("; ")}` : "",
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

export function deriveOutcomeLearningAdvisory(outcomes: unknown[] | null): OutcomeLearningAdvisory {
  const rows = Array.isArray(outcomes) ? outcomes.slice(0, 8) : [];
  const signal = deriveOutcomeScoreAdjustment(rows);
  const warnings: string[] = [];
  const strengths: string[] = [];
  const nextActions: string[] = [];

  rows.forEach((row) => {
    const item = row as { outcome?: FundingOutcome; learningNotes?: string | null; funderFeedback?: string | null };
    const insight = parseStoredInsight(item.learningNotes);
    if (insight) {
      warnings.push(...insight.weaknesses);
      strengths.push(...insight.strengths);
      nextActions.push(...insight.nextActions);
      return;
    }
    if (item.outcome === "rejected" || item.outcome === "withdrawn") {
      warnings.push("Previous outcome feedback suggests checking the official funder criteria and evidence requirements before applying.");
    }
    if (item.outcome === "awarded" || item.outcome === "shortlisted") {
      strengths.push("Previous positive outcome suggests reusing the strongest evidence and positioning from that application.");
    }
  });

  return {
    signal,
    warnings: unique(warnings).slice(0, 4),
    strengths: unique(strengths).slice(0, 4),
    nextActions: unique(nextActions).slice(0, 4),
  };
}

export function applyOutcomeScoreAdjustment(
  result: EligibilityResult,
  adjustmentOrAdvisory: number | OutcomeLearningAdvisory
): EligibilityResult {
  const advisory =
    typeof adjustmentOrAdvisory === "number"
      ? { signal: adjustmentOrAdvisory, warnings: [], strengths: [], nextActions: [] }
      : adjustmentOrAdvisory;
  const signal = Number.isFinite(advisory.signal) ? advisory.signal : 0;
  if (signal === 0 && advisory.warnings.length === 0 && advisory.strengths.length === 0 && advisory.nextActions.length === 0) {
    return result;
  }
  const alreadyApplied = [
    result.summary ?? "",
    result.reason ?? "",
    ...(result.reasons ?? []),
    ...(result.outcomeWarnings ?? []),
  ].some((value) => value.includes("Outcome feedback advisory"));
  if (alreadyApplied) return result;

  const label =
    signal < 0
      ? "Outcome feedback advisory: review prior funder feedback before applying. This warning does not reduce the eligibility score."
      : "Outcome feedback advisory: reuse strengths from previous positive outcomes where relevant. This signal does not increase the eligibility score.";
  const genericWarning =
    "Check the official funder page, eligibility criteria, and required evidence before applying; outcome feedback is advisory, not a screening rule.";
  const outcomeWarnings = unique([
    label,
    ...(advisory.warnings.length > 0 ? advisory.warnings : signal < 0 ? [genericWarning] : []),
    ...advisory.nextActions.map((action) => `Before applying: ${action}`),
  ]).slice(0, 6);

  return {
    ...result,
    outcomeWarnings: unique([...(result.outcomeWarnings ?? []), ...outcomeWarnings]),
    outcomeStrengths: unique([...(result.outcomeStrengths ?? []), ...advisory.strengths]).slice(0, 4),
  };
}
