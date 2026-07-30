import { getApplicantTypeGate } from "@/lib/eligibility-hard-gates";
import { cleanJsonResponse, completeJson } from "@/lib/openai-client";
import { applyEligibilityScoreGuards } from "@/lib/eligibility-score-guards";
import { eligibilityFactsToText, normalizeEligibilityFacts, type EligibilityFact } from "@/lib/eligibility-facts";
import {
  getCachedEligibilityDecision,
  storeCachedEligibilityDecision,
  touchEligibilityAiCaches,
} from "@/lib/eligibility-ai-cache";

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

interface ProfileForMatching {
  businessName: string;
  sector: string;
  missionStatement: string;
  description: string;
  location: string;
  employeeCount: number | null;
  annualRevenue: number | null;
  yearEstablished?: number | null;
  incorporationDate?: string | null;
  tradingStartDate?: string | null;
  expectedEmployeeGrowth?: string | null;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  preferredOpportunityTypes?: string[] | null;
  fundingDetails: string | null;
  businessType?: string | null;
  legalStructure?: string | null;
  businessStage?: string | null;
  businessSizeBand?: string | null;
  founderEmploymentStatus?: string | null;
  localAuthority?: string | null;
  areasServed?: string | null;
  coFundingCapacity?: string | null;
  reimbursementReadiness?: string | null;
  coFundingAvailable?: string | null;
  matchFundingDetails?: string | null;
  previousGrantExperience?: string | null;
  fundingOutcomeSignals?: string | null;
  eligibilityFacts?: EligibilityFact[] | unknown;
}

interface GrantForMatching {
  id: string;
  name: string;
  funder: string;
  amount: number | null;
  eligibility: string;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[];
  sectors: string[];
  regions: string[];
}

export interface GrantMatch {
  grantId: string;
  score: number;
  reason: string;
}

export type EligibilityDecision = "likely_eligible" | "review" | "unlikely";

export interface ImprovementPlan {
  gaps?: string[];
  actions?: string[];
  timeline?: string;
}

export type ConfidenceBand = "high" | "medium" | "low";

export interface EligibilityResult {
  decision: EligibilityDecision;
  reason: string;
  confidence: number;
  /** 0-100 match score (same as confidence for backward compat) */
  score?: number;
  /** Short overall summary */
  summary?: string;
  /** Bullet reasons: why eligible (high score) or why only X% (low/medium) */
  reasons?: string[];
  /** How grant aligns with business (for high score) */
  alignment?: string[];
  /** For score < 75: gaps + actionable steps to improve fit */
  improvementPlan?: ImprovementPlan;
  /** Criteria the applicant meets (for "Why you scored X%") */
  met?: string[];
  /** Criteria missing or weak */
  missing?: string[];
  /** Estimated chance of a competitive funding outcome, not just rule eligibility. */
  winProbability?: number;
  evidenceStrength?: "strong" | "medium" | "weak";
  /** Advisory-only warnings from past outcomes. These must not alter score or decision. */
  outcomeWarnings?: string[];
  outcomeStrengths?: string[];
}

export function getConfidenceBand(score: number): ConfidenceBand {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}

/**
 * Eligibility decision engine: one grant vs profile → score, decision, reasons, improvement plan.
 * Powers "Why this grant?" and proactive suggestions + notifications.
 */
export async function getEligibilityDecision(
  profile: ProfileForMatching,
  grant: GrantForMatching
): Promise<EligibilityResult> {
  const companyAge = profile.yearEstablished ? Math.max(0, new Date().getFullYear() - profile.yearEstablished) : null;
  const eligibilityFacts = eligibilityFactsToText(profile.eligibilityFacts, 16);
  const cached = await getCachedEligibilityDecision(profile as unknown as Record<string, unknown>, grant);
  if (cached) return cached;
  await touchEligibilityAiCaches(profile as unknown as Record<string, unknown>, grant);

  const rawText = await completeJson(
    `You are a UK grant eligibility expert. Given this business and this grant, give an eligibility assessment.

Business: ${profile.businessName} (${profile.sector}). Location: ${profile.location}. Local authority/areas served: ${[profile.localAuthority, profile.areasServed].filter(Boolean).join(" / ") || "N/A"}. Employees: ${profile.employeeCount ?? "N/A"}. Expected employee growth: ${profile.expectedEmployeeGrowth || "N/A"}. Revenue: ${profile.annualRevenue != null ? `£${profile.annualRevenue.toLocaleString("en-GB")}` : "N/A"}. Year established: ${profile.yearEstablished ?? "N/A"}. Incorporation/trading start: ${[profile.incorporationDate, profile.tradingStartDate].filter(Boolean).join(" / ") || "N/A"}. Company age: ${companyAge != null ? `${companyAge} years` : "N/A"}. Funding sought: £${profile.fundingMin.toLocaleString("en-GB")}–£${profile.fundingMax.toLocaleString("en-GB")}. Purposes: ${profile.fundingPurposes.join(", ")}. Preferred opportunity types: ${(profile.preferredOpportunityTypes ?? []).join(", ") || "N/A"}. ${profile.missionStatement ? `Mission: ${profile.missionStatement}.` : ""} ${profile.description ? `Description: ${profile.description}` : ""}
Business type: ${profile.businessType || "N/A"}. Legal structure: ${profile.legalStructure || "N/A"}. Stage/size: ${[profile.businessStage, profile.businessSizeBand].filter(Boolean).join(" / ") || "N/A"}. Founder/employment status: ${profile.founderEmploymentStatus || "N/A"}.
Co-funding/cash-flow readiness: ${[profile.coFundingCapacity, profile.reimbursementReadiness, profile.coFundingAvailable, profile.matchFundingDetails].filter(Boolean).join(" | ") || "N/A"}. Previous grant experience: ${profile.previousGrantExperience || "N/A"}.
Business eligibility facts (status included; suggested or needs-evidence facts must be treated cautiously): ${eligibilityFacts || "None provided"}.

Grant: ${grant.name} (${grant.funder}). Amount: ${grant.amount != null ? `£${grant.amount.toLocaleString("en-GB")}` : "Varies"}. Eligibility: ${grant.eligibility}.${grant.description ? ` Description: ${grant.description.slice(0, 800)}.` : ""}${grant.objectives ? ` Objectives: ${grant.objectives.slice(0, 400)}.` : ""}${grant.applicantTypes?.length ? ` Applicant types: ${grant.applicantTypes.join(", ")}.` : ""} Sectors: ${(grant.sectors ?? []).join(", ")}. Regions: ${(grant.regions ?? []).join(", ")}.

Return ONLY valid JSON. No markdown. Use this exact shape:
{
  "decision": "likely_eligible" | "review" | "unlikely",
  "reason": "2-3 sentence explanation for the applicant.",
  "confidence": 0-100,
  "score": 0-100,
  "summary": "One sentence overall take.",
  "reasons": ["Reason 1", "Reason 2", "Reason 3"],
  "alignment": ["How grant aligns with business - only if score >= 70, else []"],
  "improvementPlan": { "gaps": ["Gap 1"], "actions": ["Action 1"], "timeline": "Short term" } or null,
  "met": ["Short label for each eligibility criterion the business clearly meets", "e.g. UK registered company", "SME eligible"],
  "missing": ["Short label for each criterion that is missing or weak", "e.g. Requires pilot deployment evidence", "Requires sustainability component"],
  "winProbability": 0-100,
  "evidenceStrength": "strong" | "medium" | "weak"
}

Rules:
- score and confidence should match (0-100). likely_eligible => score >= 75, review => 40-74, unlikely => < 40.
- Treat legal applicant type as a hard gate. If the grant is only for charities, non-profits, CICs, or social enterprises and the business type does not match, decision must be unlikely and score must be below 30 even if sector, region, and purpose align.
- Treat expired opportunities and past project windows as hard gates. If the grant text says applications have closed, the deadline has passed, or projects must start/end in a period that is already over, decision must be unlikely and score must be below 10.
- Treat explicit measurable criteria as hard qualification gates. If the grant requires minimum revenue, minimum employee count, maximum employee count, or minimum trading/company age and the profile does not meet it, decision must be unlikely and score must be below 40.
- Treat legal structure, business stage, size band, co-funding, reimbursement, property, consortium, and academic-partner requirements as qualification gates when the grant explicitly states them.
- Treat micro/small/medium businesses as eligible for generic SME grants unless the funder gives a stricter threshold.
- If revenue, employee count, or year established is missing and the grant explicitly depends on it, do not recommend as high fit; mark it review and call out the missing profile data.
- Do not penalise missing revenue, employee count, or company age when the grant text does not state a measurable threshold or clearly depend on that fact.
- Do not invent revenue, employee-count, company-age, traction, or investment-readiness criteria that are not stated in the current grant. Missing profile data can be an advisory note only when useful, not a scoring blocker.
- reasons: 3-5 short bullets. For high score explain why they're eligible; for low/medium explain what doesn't match or is missing.
- alignment: only when score >= 70, 2-4 bullets on how this grant fits their business.
- improvementPlan: only when score < 75. gaps = what's missing or misaligned; actions = concrete steps to improve fit; timeline optional (e.g. "0-3 months"). Use null when score >= 75.
- met: 2-6 short labels (one line each) for criteria the business clearly satisfies. Use checkmark-friendly phrasing.
- missing: 0-6 short labels for criteria that are missing, weak, or unclear. Use warning-friendly phrasing. Use [] when score >= 85.
- winProbability is not legal eligibility. It estimates competitive funding likelihood based on fit, evidence strength, clarity, and likely competition. Keep it conservative.
- evidenceStrength reflects whether the profile contains enough proof: strong = clear metrics/track record/evidence, medium = plausible but needs proof, weak = thin evidence.`,
    1200
  );

  const text = cleanJsonResponse(rawText);
  try {
    const jsonStr = text.startsWith("{") ? text : (text.match(/\{[\s\S]*\}/)?.[0] ?? text);
    const parsed = JSON.parse(jsonStr) as EligibilityResult;
    const d = parsed.decision;
    if (d !== "likely_eligible" && d !== "review" && d !== "unlikely") parsed.decision = "review";
    const conf = Math.min(100, Math.max(0, Number(parsed.confidence) ?? Number(parsed.score) ?? 50));
    parsed.confidence = conf;
    parsed.score = Math.min(100, Math.max(0, Number(parsed.score) ?? conf));
    parsed.reason = parsed.reason ?? parsed.summary ?? "";
    parsed.summary = parsed.summary ?? parsed.reason;
    if (!Array.isArray(parsed.reasons)) parsed.reasons = [];
    if (parsed.score >= 75 && parsed.improvementPlan) parsed.improvementPlan = undefined;
    if (!Array.isArray(parsed.met)) parsed.met = [];
    if (!Array.isArray(parsed.missing)) parsed.missing = [];
    parsed.winProbability = Math.min(100, Math.max(0, Number(parsed.winProbability) || parsed.score || conf));
    if (!["strong", "medium", "weak"].includes(String(parsed.evidenceStrength))) {
      parsed.evidenceStrength = parsed.score >= 80 ? "strong" : parsed.score >= 55 ? "medium" : "weak";
    }
    const applicantGate = getApplicantTypeGate(profile.businessType, grant);
    if (applicantGate && !applicantGate.profileMatches) {
      const gatedResult: EligibilityResult = {
        ...parsed,
        decision: "unlikely",
        score: Math.min(parsed.score ?? 25, 25),
        confidence: Math.min(parsed.confidence, 25),
        summary: `Unlikely eligible: ${applicantGate.reason}, which does not match your business type.`,
        reason: `This grant appears restricted by applicant type. ${applicantGate.reason}, but your profile is not marked as one of those organisation types.`,
        alignment: [],
        improvementPlan: {
          gaps: [applicantGate.reason],
          actions: ["Only apply if your organisation is registered under one of the required applicant types."],
          timeline: "Before applying",
        },
        missing: uniqueStrings([...(parsed.missing ?? []), applicantGate.reason]),
        winProbability: Math.min(parsed.winProbability ?? 25, 25),
        evidenceStrength: "weak",
      };
      await storeCachedEligibilityDecision(profile as unknown as Record<string, unknown>, grant, gatedResult);
      return gatedResult;
    }
    const finalResult = applyEligibilityScoreGuards(profile, grant, parsed);
    await storeCachedEligibilityDecision(profile as unknown as Record<string, unknown>, grant, finalResult);
    return finalResult;
  } catch {
    return {
      decision: "review",
      reason: "We couldn't automatically assess eligibility. Please read the grant criteria and decide.",
      confidence: 50,
      score: 50,
      summary: "We couldn't automatically assess eligibility. Please read the grant criteria and decide.",
      reasons: [],
      winProbability: 50,
      evidenceStrength: "weak",
    };
  }
}

export interface ProfileImprovementSuggestions {
  missionStatement?: string;
  description?: string;
  fundingDetails?: string;
}

export interface BusinessDnaCoverageSuggestions {
  missionStatement?: string;
  description?: string;
  fundingDetails?: string;
  innovationCapabilities?: string;
  socialImpact?: string;
  teamExpertise?: string;
  fundingPurposes?: string[];
  eligibilityFacts?: EligibilityFact[];
  rationale?: string[];
  safeguards?: string[];
}

/**
 * Suggests rewritten profile sections to improve eligibility for a specific grant.
 * Uses improvementPlan and missing criteria from eligibility result.
 */
export async function suggestProfileImprovements(
  profile: ProfileForMatching,
  grant: GrantForMatching,
  eligibilityContext: { missing?: string[]; improvementPlan?: ImprovementPlan; summary?: string }
): Promise<ProfileImprovementSuggestions> {
  const text = await completeJson(
    `You are a grant application expert. Rewrite the business profile sections below to better align with this grant, addressing the missing or weak criteria. Keep the same tone and facts; improve clarity and emphasis to match the grant.

Grant: ${grant.name} (${grant.funder}). Eligibility focus: ${grant.eligibility.slice(0, 400)}.

Current profile:
- Mission: ${profile.missionStatement}
- Description: ${profile.description}
- Funding details: ${profile.fundingDetails ?? "None"}

What to address: ${(eligibilityContext.missing ?? []).join("; ")}. ${eligibilityContext.improvementPlan?.actions?.length ? "Actions: " + eligibilityContext.improvementPlan.actions.join("; ") : ""}

Return ONLY valid JSON. No markdown. Use this exact shape (only include keys you are rewriting):
{ "missionStatement": "rewritten mission if needed", "description": "rewritten description if needed", "fundingDetails": "rewritten funding narrative if needed" }
Omit a key if no change suggested. Keep each value concise and human; do not exceed 2-3 paragraphs for description.`,
    1500
  );

  try {
    const parsed = JSON.parse(cleanJsonResponse(text)) as ProfileImprovementSuggestions;
    return {
      ...(parsed.missionStatement && { missionStatement: parsed.missionStatement }),
      ...(parsed.description && { description: parsed.description }),
      ...(parsed.fundingDetails && { fundingDetails: parsed.fundingDetails }),
    };
  } catch {
    return {};
  }
}

export async function suggestBusinessDnaCoverageImprovements(
  profile: Record<string, unknown>,
  matchHealth: {
    currentHighMatches: number;
    currentWithinReach: number;
    daysSinceHighMatch: number | null;
    topBlockers: Array<{ label: string; detail: string; count: number }>;
    profileGaps: string[];
    recommendedActions: string[];
  }
): Promise<BusinessDnaCoverageSuggestions> {
  const text = await completeJson(
    `You are improving a GrantsCopilot Business DNA profile so future grant eligibility scoring can recognise the business more accurately.

Rules:
- Use ONLY facts already present in the profile, team data, document summaries, website intelligence, and blocker list below.
- Do NOT invent revenue, employee count, customers, awards, certifications, traction, partnerships, grant wins, dates, team size, or legal status.
- If a missing fact is important, put it in safeguards/rationale, not in rewritten profile text.
- If a fact is already supported by the profile or blocker list but belongs in a structured edge-case fact, return it in eligibilityFacts with confidence "suggested" so the user can confirm it manually.
- Broaden positioning only when the profile already supports it.
- Keep language grant-ready, factual, and concise.

Current profile JSON:
${JSON.stringify(profile, null, 2).slice(0, 9000)}

Match health:
${JSON.stringify(matchHealth, null, 2)}

Return ONLY valid JSON with this shape. Omit fields where no safe improvement is possible:
{
  "missionStatement": "optional improved mission",
  "description": "optional improved description",
  "fundingDetails": "optional improved funding use summary",
  "innovationCapabilities": "optional improved innovation/R&D capability",
  "socialImpact": "optional improved social impact",
  "teamExpertise": "optional improved team expertise",
  "fundingPurposes": ["optional", "existing-fact-supported", "purposes"],
  "eligibilityFacts": [
    {
      "label": "optional concise fact label",
      "value": "optional supported fact or manual confirmation needed",
      "category": "Property / premises" | "Match funding" | "Certification / compliance" | "Trading history" | "Financial evidence" | "Partnerships" | "Other",
      "evidence": "optional supporting note",
      "source": "ai_suggested",
      "confidence": "suggested"
    }
  ],
  "rationale": ["why these safe edits may improve matching"],
  "safeguards": ["facts the user should add manually instead of AI inventing them"]
}`,
    2200
  );

  try {
    const parsed = JSON.parse(cleanJsonResponse(text)) as BusinessDnaCoverageSuggestions;
    const fundingPurposes = Array.isArray(parsed.fundingPurposes)
      ? uniqueStrings(parsed.fundingPurposes.map((value) => String(value).trim())).slice(0, 12)
      : undefined;
    return {
      ...(parsed.missionStatement && { missionStatement: String(parsed.missionStatement).trim() }),
      ...(parsed.description && { description: String(parsed.description).trim() }),
      ...(parsed.fundingDetails && { fundingDetails: String(parsed.fundingDetails).trim() }),
      ...(parsed.innovationCapabilities && { innovationCapabilities: String(parsed.innovationCapabilities).trim() }),
      ...(parsed.socialImpact && { socialImpact: String(parsed.socialImpact).trim() }),
      ...(parsed.teamExpertise && { teamExpertise: String(parsed.teamExpertise).trim() }),
      ...(fundingPurposes && fundingPurposes.length > 0 && { fundingPurposes }),
      ...(Array.isArray(parsed.eligibilityFacts) && {
        eligibilityFacts: normalizeEligibilityFacts(parsed.eligibilityFacts)
          .map((fact) => ({ ...fact, source: "ai_suggested" as const, confidence: "suggested" as const }))
          .slice(0, 8),
      }),
      ...(Array.isArray(parsed.rationale) && { rationale: parsed.rationale.map(String).filter(Boolean).slice(0, 6) }),
      ...(Array.isArray(parsed.safeguards) && { safeguards: parsed.safeguards.map(String).filter(Boolean).slice(0, 6) }),
    };
  } catch {
    return {};
  }
}
