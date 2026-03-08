import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Strip markdown code fences and leading/trailing whitespace from a model response
 * so JSON.parse succeeds even when the model wraps output in ```json ... ```.
 */
function cleanJsonResponse(raw: string): string {
  let text = raw.trim();
  // Remove ```json ... ``` or ``` ... ``` wrappers
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) text = fenceMatch[1].trim();
  return text;
}

interface ProfileForMatching {
  businessName: string;
  sector: string;
  missionStatement: string;
  description: string;
  location: string;
  employeeCount: number | null;
  annualRevenue: number | null;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  fundingDetails: string | null;
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

export async function matchGrantsToProfile(
  profile: ProfileForMatching,
  grants: GrantForMatching[]
): Promise<GrantMatch[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a grant matching expert. Given this business profile and available grants, return a JSON array ranking grants by match quality. Use ALL available information about each grant (name, funder, eligibility criteria, description, objectives, sectors, applicant types) to make an informed assessment.

Business Profile:
- Name: ${profile.businessName}
- Sector: ${profile.sector}
- Mission: ${profile.missionStatement}
- Description: ${profile.description}
- Location: ${profile.location}
- Employees: ${profile.employeeCount ?? "Not specified"}
- Annual Revenue: ${profile.annualRevenue ? `£${profile.annualRevenue.toLocaleString("en-GB")}` : "Not specified"}
- Funding Range: £${profile.fundingMin.toLocaleString("en-GB")} – £${profile.fundingMax.toLocaleString("en-GB")}
- Funding Purposes: ${profile.fundingPurposes.join(", ")}${profile.fundingDetails ? `\n- Additional Details: ${profile.fundingDetails}` : ""}

Available Grants:
${JSON.stringify(grants.map(g => ({
  id: g.id,
  name: g.name,
  funder: g.funder,
  amount: g.amount,
  eligibility: g.eligibility,
  ...(g.description ? { description: g.description.slice(0, 500) } : {}),
  ...(g.objectives ? { objectives: g.objectives.slice(0, 300) } : {}),
  ...(g.applicantTypes?.length ? { applicantTypes: g.applicantTypes } : {}),
  sectors: g.sectors,
  regions: g.regions,
})), null, 2)}

Score each grant 0-100 based on:
- Sector & mission alignment (25%) — does the grant's purpose match the business sector and mission?
- Eligibility match (25%) — does the business meet the grant's eligibility criteria and applicant types?
- Description & objectives fit (20%) — do the grant's description and objectives align with the business?
- Funding amount fit (15%) — is the grant amount within the business's funding range?
- Regional availability (15%) — does the business location match the grant's regions?

Return ONLY valid JSON. No markdown, no explanation. Format:
[{"grantId": "...", "score": 85, "reason": "Short 1-2 sentence explanation"}]

Include all grants, sorted by score descending.`,
      },
    ],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";
  const text = cleanJsonResponse(rawText);

  try {
    const parsed = JSON.parse(text) as GrantMatch[];
    return parsed.sort((a, b) => b.score - a.score);
  } catch {
    // Try extracting a JSON array from the response (handles extra prose around JSON)
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]) as GrantMatch[];
        return parsed.sort((a, b) => b.score - a.score);
      } catch { /* fall through to default */ }
    }
    return grants.map((g) => ({
      grantId: g.id,
      score: 50,
      reason: "Unable to determine match quality. Please review manually.",
    }));
  }
}

export type EligibilityDecision = "likely_eligible" | "review" | "unlikely";

export interface ImprovementPlan {
  gaps?: string[];
  actions?: string[];
  timeline?: string;
}

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
}

/**
 * Eligibility decision engine: one grant vs profile → score, decision, reasons, improvement plan.
 * Powers "Why this grant?" and proactive suggestions + notifications.
 */
export async function getEligibilityDecision(
  profile: ProfileForMatching,
  grant: GrantForMatching
): Promise<EligibilityResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: `You are a UK grant eligibility expert. Given this business and this grant, give an eligibility assessment.

Business: ${profile.businessName} (${profile.sector}). Location: ${profile.location}. Employees: ${profile.employeeCount ?? "N/A"}. Revenue: ${profile.annualRevenue ? `£${profile.annualRevenue.toLocaleString("en-GB")}` : "N/A"}. Funding sought: £${profile.fundingMin.toLocaleString("en-GB")}–£${profile.fundingMax.toLocaleString("en-GB")}. Purposes: ${profile.fundingPurposes.join(", ")}. ${profile.missionStatement ? `Mission: ${profile.missionStatement}.` : ""} ${profile.description ? `Description: ${profile.description}` : ""}

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
  "improvementPlan": { "gaps": ["Gap 1"], "actions": ["Action 1"], "timeline": "Short term" } or null
}

Rules:
- score and confidence should match (0-100). likely_eligible => score >= 75, review => 40-74, unlikely => < 40.
- reasons: 3-5 short bullets. For high score explain why they're eligible; for low/medium explain what doesn't match or is missing.
- alignment: only when score >= 70, 2-4 bullets on how this grant fits their business.
- improvementPlan: only when score < 75. gaps = what's missing or misaligned; actions = concrete steps to improve fit; timeline optional (e.g. "0-3 months"). Use null when score >= 75.`,
      },
    ],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "";
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
    return parsed;
  } catch {
    return {
      decision: "review",
      reason: "We couldn't automatically assess eligibility. Please read the grant criteria and decide.",
      confidence: 50,
      score: 50,
      summary: "We couldn't automatically assess eligibility. Please read the grant criteria and decide.",
      reasons: [],
    };
  }
}
