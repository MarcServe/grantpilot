import { isTrustedMatchScoringSource, type GrantUserState } from "@/lib/eligible-match-rules";
import type { GrantEffortSignal } from "@/lib/grant-effort";

export type ScoreDimensions = {
  eligibilityConfidence: number;
  strategicFit: number;
  applicationReadiness: number;
  practicalSuitability: number;
  priorityScore: number;
};

export type ConfidenceState = "trusted_ai" | "preliminary" | "needs_review" | "blocked" | "unscored";

export type DecisionSignals = {
  scoreDimensions: ScoreDimensions;
  confidenceState: ConfidenceState;
  recommendationCategory: string | null;
  primaryBlocker: string | null;
  nextAction: string;
  profileFactsNeeded: string[];
};

type ImprovementPlan = {
  gaps?: string[];
  actions?: string[];
  timeline?: string;
} | null;

function clampScore(value: unknown): number {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function cleanList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function confidenceStateFor(params: {
  score: number | null;
  scoringSource?: string | null;
  userState?: GrantUserState | null;
  suppressionReason?: string | null;
}): ConfidenceState {
  if (params.suppressionReason || params.userState === "deferred" || params.userState === "applied" || params.userState === "dismissed") {
    return "blocked";
  }
  if (params.score == null) return "unscored";
  if (!isTrustedMatchScoringSource(params.scoringSource ?? null)) {
    return params.scoringSource === "heuristic" ? "preliminary" : "needs_review";
  }
  return "trusted_ai";
}

export function deriveDecisionSignals(params: {
  score: number | null;
  scoringSource?: string | null;
  missingCriteria?: string[] | null;
  improvementPlan?: ImprovementPlan;
  effort?: GrantEffortSignal | null;
  userState?: GrantUserState | null;
  suppressionReason?: string | null;
}): DecisionSignals {
  const score = params.score == null ? null : clampScore(params.score);
  const blockers = cleanList([
    params.suppressionReason,
    ...(params.missingCriteria ?? []),
    ...(params.improvementPlan?.gaps ?? []),
    ...(params.improvementPlan?.actions ?? []),
  ]);
  const missingPenalty = Math.min(35, blockers.length * 5);
  const base = score ?? 0;
  const eligibilityConfidence = clampScore(base);
  const strategicFit = clampScore(base - Math.min(24, blockers.length * 4));
  const applicationReadiness = clampScore(params.effort?.achievabilityScore ?? base - missingPenalty);
  const practicalSuitability = clampScore((eligibilityConfidence + strategicFit + applicationReadiness) / 3);
  const priorityScore = clampScore(params.effort?.opportunityScore ?? practicalSuitability);
  const confidenceState = confidenceStateFor({
    score,
    scoringSource: params.scoringSource,
    userState: params.userState,
    suppressionReason: params.suppressionReason,
  });
  const primaryBlocker = blockers[0] ?? null;

  let nextAction = "Review the grant details before spending time on an application.";
  if (confidenceState === "blocked") {
    nextAction = primaryBlocker
      ? `Resolve this blocker before treating it as active: ${primaryBlocker}`
      : "Review the saved state or blocked requirement before treating this as active.";
  } else if (confidenceState === "unscored") {
    nextAction = "Wait for AI scoring or run a fresh eligibility check before prioritising this.";
  } else if (confidenceState === "preliminary" || confidenceState === "needs_review") {
    nextAction = "Run full AI eligibility scoring before treating this as decision-ready.";
  } else if ((score ?? 0) >= 85 && params.effort?.priorityLabel === "Apply today") {
    nextAction = "Start the application or paste funder questions into Founder Pack.";
  } else if ((score ?? 0) >= 85) {
    nextAction = "Check the application route, strengthen evidence, then start the application.";
  } else if ((score ?? 0) >= 50) {
    nextAction = "Use the Funding Readiness Roadmap to close the evidence gaps.";
  }

  return {
    scoreDimensions: {
      eligibilityConfidence,
      strategicFit,
      applicationReadiness,
      practicalSuitability,
      priorityScore,
    },
    confidenceState,
    recommendationCategory: params.effort?.recommendationCategory ?? null,
    primaryBlocker,
    nextAction,
    profileFactsNeeded: blockers.slice(0, 6),
  };
}
