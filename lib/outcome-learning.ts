import { completeJson, cleanJsonResponse } from "@/lib/openai-client";

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
