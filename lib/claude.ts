import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
        content: `You are a UK grant matching expert. Given this business profile and available grants, return a JSON array ranking grants by match quality.

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
${JSON.stringify(grants, null, 2)}

Score each grant 0-100 based on:
- Sector alignment (30%)
- Eligibility match (30%)
- Funding amount fit (20%)
- Regional availability (20%)

Return ONLY valid JSON. No markdown, no explanation. Format:
[{"grantId": "...", "score": 85, "reason": "Short 1-2 sentence explanation"}]

Include all grants, sorted by score descending.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text) as GrantMatch[];
    return parsed.sort((a, b) => b.score - a.score);
  } catch {
    return grants.map((g) => ({
      grantId: g.id,
      score: 50,
      reason: "Unable to determine match quality. Please review manually.",
    }));
  }
}

export type EligibilityDecision = "likely_eligible" | "review" | "unlikely";

export interface EligibilityResult {
  decision: EligibilityDecision;
  reason: string;
  confidence: number;
}

/**
 * Eligibility decision engine: one grant vs profile → decision + reasoning.
 * Powers "Why this grant?" and surfaces vertical depth.
 */
export async function getEligibilityDecision(
  profile: ProfileForMatching,
  grant: GrantForMatching
): Promise<EligibilityResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `You are a UK grant eligibility expert. Given this business and this grant, give an eligibility decision.

Business: ${profile.businessName} (${profile.sector}). Location: ${profile.location}. Employees: ${profile.employeeCount ?? "N/A"}. Revenue: ${profile.annualRevenue ? `£${profile.annualRevenue.toLocaleString("en-GB")}` : "N/A"}. Funding sought: £${profile.fundingMin.toLocaleString("en-GB")}–£${profile.fundingMax.toLocaleString("en-GB")}. Purposes: ${profile.fundingPurposes.join(", ")}.

Grant: ${grant.name} (${grant.funder}). Amount: ${grant.amount != null ? `£${grant.amount.toLocaleString("en-GB")}` : "Varies"}. Eligibility: ${grant.eligibility}. Sectors: ${(grant.sectors ?? []).join(", ")}. Regions: ${(grant.regions ?? []).join(", ")}.

Return ONLY valid JSON. No markdown. Format:
{"decision": "likely_eligible" | "review" | "unlikely", "reason": "2-3 sentence explanation for the applicant.", "confidence": 0-100}

Use likely_eligible when the business clearly fits. Use review when borderline or more info needed. Use unlikely when clear misfit.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  try {
    const parsed = JSON.parse(text) as EligibilityResult;
    const d = parsed.decision;
    if (d !== "likely_eligible" && d !== "review" && d !== "unlikely") parsed.decision = "review";
    parsed.confidence = Math.min(100, Math.max(0, Number(parsed.confidence) || 50));
    return parsed;
  } catch {
    return {
      decision: "review",
      reason: "We couldn't automatically assess eligibility. Please read the grant criteria and decide.",
      confidence: 0,
    };
  }
}
