import type { EligibilityResult } from "@/lib/claude";
import type { GrantIntelligence, GrantRequirement } from "@/lib/grant-intelligence-schema";

type GrantForMatch = {
  id?: string;
  name?: string | null;
  funder?: string | null;
  amount?: number | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[] | null;
  sectors?: string[] | null;
  regions?: string[] | null;
};

export type ProfileFacts = {
  businessName: string;
  sector: string;
  description: string;
  missionStatement: string;
  location: string;
  businessType: string;
  employeeCount: number | null;
  annualRevenue: number | null;
  yearEstablished: number | null;
  fundingMin: number | null;
  fundingMax: number | null;
  fundingPurposes: string[];
  fundingDetails: string;
};

export type GrantIntelligenceMatch = EligibilityResult & {
  score: number;
  source: "intelligence";
  requiresOpenAiReview: boolean;
  matchSignals: string[];
  riskSignals: string[];
};

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function words(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9£€$]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !["and", "the", "for", "with", "from", "this", "that", "into", "your"].includes(word))
  );
}

function overlapScore(left: string, right: string): number {
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const word of a) if (b.has(word)) overlap++;
  return overlap / Math.max(1, Math.min(a.size, b.size));
}

function containsAny(haystack: string, needles: string[]): boolean {
  const text = haystack.toLowerCase();
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}

function pushUnique(target: string[], value: string): void {
  if (!target.some((item) => item.toLowerCase() === value.toLowerCase())) target.push(value);
}

function profileRegion(profile: ProfileFacts): string {
  const text = profile.location.toLowerCase();
  if (/\buk\b|united kingdom|england|scotland|wales|northern ireland|london|manchester|birmingham|bristol/.test(text)) return "UK";
  if (/\beu\b|europe/.test(text)) return "EU";
  return profile.location || "Unknown";
}

function regionMatches(profile: ProfileFacts, regions: string[]): "match" | "unknown" | "mismatch" {
  if (regions.length === 0) return "unknown";
  const profileLocation = profileRegion(profile).toLowerCase();
  const normalized = regions.map((region) => region.toLowerCase());
  if (normalized.some((region) => /global|international|worldwide|anywhere/.test(region))) return "match";
  if (profileLocation === "uk" && normalized.some((region) => /uk|united kingdom|england|scotland|wales|northern ireland|europe|eu/.test(region))) return "match";
  if (profileLocation === "eu" && normalized.some((region) => /europe|eu|international|global/.test(region))) return "match";
  return "mismatch";
}

function profileApplicantTerms(profile: ProfileFacts): string[] {
  const type = `${profile.businessType} ${profile.description} ${profile.businessName}`.toLowerCase();
  const terms = ["business", "company", "organisation"];
  if (/startup|start-up|early stage/.test(type)) terms.push("startup", "start-up");
  if (/sme|small|micro/.test(type) || (profile.employeeCount != null && profile.employeeCount <= 250)) terms.push("sme", "small business");
  if (/charity|nonprofit|not-for-profit|cic/.test(type)) terms.push("charity", "nonprofit", "not-for-profit", "cic");
  if (/university|researcher|academic/.test(type)) terms.push("researcher", "academic", "university");
  return terms;
}

function applicantMatch(profile: ProfileFacts, applicantTypes: string[], hardGates: string[]): "match" | "unknown" | "mismatch" {
  const allTypes = [...applicantTypes, ...hardGates].join(" ").toLowerCase();
  if (!allTypes.trim()) return "unknown";
  const profileTerms = profileApplicantTerms(profile);
  if (profileTerms.some((term) => allTypes.includes(term))) return "match";
  if (/\bindividuals?\b|students?\b|households?\b/.test(allTypes) && !profileTerms.includes("individual")) return "mismatch";
  if (/charit(y|ies)|nonprofit|not-for-profit/.test(allTypes) && !profileTerms.some((term) => /charity|nonprofit|not-for-profit|cic/.test(term))) return "mismatch";
  if (/universit|academic|researcher/.test(allTypes) && !profileTerms.some((term) => /university|academic|researcher/.test(term))) return "mismatch";
  return "unknown";
}

function textCorpus(profile: ProfileFacts): string {
  return [
    profile.businessName,
    profile.sector,
    profile.description,
    profile.missionStatement,
    profile.businessType,
    profile.fundingDetails,
    profile.fundingPurposes.join(" "),
  ].join(" ");
}

function intelligenceCorpus(intelligence: GrantIntelligence, grant: GrantForMatch): string {
  return [
    intelligence.reusableSummary,
    intelligence.eligibilityCriteria.join(" "),
    intelligence.hardGates.join(" "),
    intelligence.sectors.join(" "),
    intelligence.fundingPurposes.join(" "),
    intelligence.semanticTags.join(" "),
    intelligence.scoringHints.strongSignals.join(" "),
    grant.eligibility,
    grant.description,
    grant.objectives,
  ].join(" ");
}

function requirementGap(profile: ProfileFacts, requirement: GrantRequirement): string | null {
  const label = requirement.label.toLowerCase();
  if (/revenue|turnover|income/.test(label) && profile.annualRevenue == null) return requirement.label;
  if (/employee|staff|headcount|team/.test(label) && profile.employeeCount == null) return requirement.label;
  if (/age|trading history|incorporat|registered/.test(label) && profile.yearEstablished == null) return requirement.label;
  return null;
}

function hardGateMismatch(profile: ProfileFacts, intelligence: GrantIntelligence): string[] {
  const corpus = [...intelligence.hardGates, ...intelligence.exclusions].join(" ").toLowerCase();
  const mismatches: string[] = [];
  if (/\buk only|united kingdom only|must be uk/.test(corpus) && profileRegion(profile).toLowerCase() !== "uk") {
    mismatches.push("Applicant must be UK based");
  }
  if (/not open to businesses|individuals only|students only|households only/.test(corpus)) {
    mismatches.push("Grant is not open to businesses");
  }
  if (/charit(y|ies) only|registered charities only/.test(corpus) && applicantMatch(profile, [], ["charity"]) !== "match") {
    mismatches.push("Grant is restricted to charities");
  }
  return mismatches;
}

export function normalizeProfileFacts(profile: Record<string, unknown>): ProfileFacts {
  const get = (key: string) => profile[key] ?? profile[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
  return {
    businessName: asText(get("businessName")),
    sector: asText(get("sector")),
    description: asText(get("description")),
    missionStatement: asText(get("missionStatement")),
    location: asText(get("location")),
    businessType: asText(get("businessType")),
    employeeCount: asNumber(get("employeeCount")),
    annualRevenue: asNumber(get("annualRevenue")),
    yearEstablished: asNumber(get("yearEstablished")),
    fundingMin: asNumber(get("fundingMin")),
    fundingMax: asNumber(get("fundingMax")),
    fundingPurposes: asStringArray(get("fundingPurposes")),
    fundingDetails: asText(get("fundingDetails")),
  };
}

export function matchProfileToGrantIntelligence(
  profile: Record<string, unknown>,
  grant: GrantForMatch,
  intelligence: GrantIntelligence
): GrantIntelligenceMatch {
  const facts = normalizeProfileFacts(profile);
  const met: string[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 38;

  const hardMismatches = hardGateMismatch(facts, intelligence);
  for (const mismatch of hardMismatches) pushUnique(risks, mismatch);

  const region = regionMatches(facts, intelligence.regions.length ? intelligence.regions : grant.regions ?? []);
  if (region === "match") {
    score += 14;
    pushUnique(met, "Region/location fit");
  } else if (region === "mismatch") {
    score -= 25;
    pushUnique(missing, "Region/location does not match stated grant area");
  }

  const applicant = applicantMatch(facts, intelligence.applicantTypes.length ? intelligence.applicantTypes : grant.applicantTypes ?? [], intelligence.hardGates);
  if (applicant === "match") {
    score += 14;
    pushUnique(met, "Applicant type fit");
  } else if (applicant === "mismatch") {
    score -= 28;
    pushUnique(missing, "Applicant type appears restricted");
  }

  const profileText = textCorpus(facts);
  const grantText = intelligenceCorpus(intelligence, grant);
  const semanticOverlap = overlapScore(profileText, grantText);
  if (semanticOverlap >= 0.2 || containsAny(profileText, intelligence.sectors) || containsAny(profileText, intelligence.semanticTags)) {
    score += 18;
    pushUnique(met, "Sector and keyword alignment");
  } else if (intelligence.sectors.length > 0 || intelligence.semanticTags.length > 0) {
    score -= 7;
    pushUnique(missing, "Sector or theme alignment is not clearly evidenced");
  }

  if (containsAny(profileText, intelligence.fundingPurposes) || overlapScore(facts.fundingDetails, intelligence.fundingPurposes.join(" ")) >= 0.15) {
    score += 12;
    pushUnique(met, "Funding purpose alignment");
  } else if (intelligence.fundingPurposes.length > 0) {
    pushUnique(missing, "Funding purpose should be evidenced");
  }

  if (grant.amount != null && facts.fundingMin != null && facts.fundingMax != null) {
    if (grant.amount >= facts.fundingMin * 0.5 && grant.amount <= facts.fundingMax * 1.5) {
      score += 5;
      pushUnique(met, "Funding amount is broadly in range");
    } else {
      pushUnique(risks, "Funding amount may be outside the preferred range");
    }
  }

  for (const requirement of intelligence.measurableRequirements) {
    const gap = requirementGap(facts, requirement);
    if (gap) pushUnique(missing, gap);
  }
  if (missing.length > 0) score -= Math.min(10, missing.length * 3);

  if (intelligence.confidence >= 80) score += 4;
  if (intelligence.freshness.status === "stale") {
    score = Math.min(score, 20);
    pushUnique(risks, "Grant intelligence marks this source as stale");
  } else if (intelligence.freshness.status === "unknown") {
    pushUnique(risks, "Source freshness should be confirmed");
  }

  for (const signal of intelligence.scoringHints.strongSignals.slice(0, 4)) pushUnique(reasons, signal);
  for (const signal of intelligence.scoringHints.redFlags.slice(0, 3)) pushUnique(risks, signal);

  if (hardMismatches.length > 0) score = Math.min(score, 39);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const decision: EligibilityResult["decision"] =
    score >= 85 && hardMismatches.length === 0 ? "likely_eligible" : score >= 55 ? "review" : "unlikely";
  const requiresOpenAiReview =
    hardMismatches.length === 0 &&
    score >= 70 &&
    (score < 90 || missing.length > 0 || risks.length > 0 || intelligence.confidence < 85);

  const summary =
    decision === "likely_eligible"
      ? `${facts.businessName || "The business"} appears to be a strong fit based on reusable grant intelligence.`
      : score >= 55
        ? `${facts.businessName || "The business"} has potential alignment, but some criteria need confirmation.`
        : `${facts.businessName || "The business"} is not a strong fit based on the extracted grant criteria.`;

  return {
    source: "intelligence",
    score,
    confidence: score,
    winProbability: Math.max(20, Math.min(90, score)),
    decision,
    evidenceStrength: intelligence.confidence >= 80 ? "strong" : intelligence.confidence >= 55 ? "medium" : "weak",
    summary,
    reason: summary,
    reasons: reasons.length > 0 ? reasons : met.slice(0, 4),
    met,
    missing,
    alignment: [
      region === "match" ? "Applicant geography matches the grant region." : null,
      applicant === "match" ? "Applicant type matches the stated grant criteria." : null,
      semanticOverlap >= 0.2 ? "Business DNA overlaps with the extracted grant themes." : null,
      intelligence.confidence >= 80 ? "Grant criteria were extracted with strong confidence." : null,
    ].filter((item): item is string => Boolean(item)),
    improvementPlan: missing.length > 0 || risks.length > 0
      ? {
          gaps: [...missing, ...risks].slice(0, 6),
          actions: [
            "Confirm the official funder eligibility page and current deadline.",
            "Add evidence in Business DNA for any stated sector, applicant, revenue, team, or project requirements.",
          ],
          timeline: "Before applying",
        }
      : undefined,
    requiresOpenAiReview,
    matchSignals: met,
    riskSignals: risks,
  };
}
