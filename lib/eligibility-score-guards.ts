import { getApplicantTypeGate } from "@/lib/eligibility-hard-gates";
import { evaluateEligibilityPreScreen } from "@/lib/eligibility-prescreen";
import { getGrantFreshnessStatus } from "@/lib/grant-freshness";
import type { EligibilityResult } from "@/lib/claude";

interface GuardProfile {
  location: string;
  sector: string;
  fundingPurposes: string[];
  description?: string | null;
  missionStatement?: string | null;
  fundingDetails?: string | null;
  employeeCount?: number | null;
  annualRevenue?: number | null;
  yearEstablished?: number | null;
  businessType?: string | null;
}

interface GuardGrant {
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
}

function norm(value: string): string {
  return value.toLowerCase().trim();
}

function regionMatches(profileLocation: string, grantRegions: string[] = []): boolean {
  if (grantRegions.length === 0) return true;
  const loc = norm(profileLocation);
  if (!loc) return true;
  const uk = /\b(uk|united kingdom|england|scotland|wales|northern ireland|london|bristol|manchester|birmingham|leeds|cardiff|edinburgh|glasgow|belfast)\b/.test(loc);
  const us = /\b(us|usa|united states|america)\b/.test(loc);
  const eu = /\b(eu|europe|european union)\b/.test(loc);
  return grantRegions.some((region) => {
    const r = norm(region);
    if (/\b(global|international|worldwide)\b/.test(r)) return true;
    if (uk && /\b(uk|united kingdom|england|scotland|wales|northern ireland)\b/.test(r)) return true;
    if (us && /\b(us|usa|united states|america)\b/.test(r)) return true;
    if (eu && /\b(eu|europe|european union)\b/.test(r)) return true;
    return loc.includes(r) || r.includes(loc.split(",")[0]?.trim() ?? "");
  });
}

function sectorLooksAligned(profileSector: string, grant: GuardGrant): boolean {
  const profile = norm(profileSector);
  if (!profile) return true;
  const grantSectors = grant.sectors ?? [];
  if (grantSectors.length === 0) return true;
  if (grantSectors.some((sector) => /\b(all|any|open|general)\b/i.test(sector))) return true;
  const grantText = [
    ...grantSectors,
    grant.eligibility ?? "",
    grant.description ?? "",
    grant.objectives ?? "",
  ].join(" ").toLowerCase();
  const terms = profile.split(/[\s/&,-]+/).filter((term) => term.length > 2);
  return terms.some((term) => grantText.includes(term));
}

function purposeLooksAligned(profilePurposes: string[], grant: GuardGrant): boolean {
  if (profilePurposes.length === 0) return true;
  const grantText = [grant.eligibility ?? "", grant.description ?? "", grant.objectives ?? ""].join(" ").toLowerCase();
  return profilePurposes.some((purpose) =>
    purpose
      .toLowerCase()
      .split(/[\s/&,-]+/)
      .filter((term) => term.length > 3)
      .some((term) => grantText.includes(term))
  );
}

function grantCriteriaText(grant: GuardGrant): string {
  return [grant.eligibility ?? "", grant.description ?? "", grant.objectives ?? ""].join(" ").toLowerCase();
}

const RELEVANCE_STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
  "your",
  "business",
  "businesses",
  "company",
  "companies",
  "organisation",
  "organisations",
  "startup",
  "startups",
  "start",
  "sme",
  "smes",
  "grant",
  "fund",
  "funding",
  "support",
  "local",
  "community",
  "growth",
]);

function relevanceTerms(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !RELEVANCE_STOP_WORDS.has(term));
}

function hasCoreRelevanceEvidence(profile: GuardProfile, grant: GuardGrant): boolean {
  const profileTerms = [
    profile.sector,
    ...(profile.fundingPurposes ?? []),
    profile.description ?? "",
    profile.missionStatement ?? "",
    profile.fundingDetails ?? "",
  ].flatMap(relevanceTerms);

  const uniqueTerms = [...new Set(profileTerms)];
  if (uniqueTerms.length === 0) return true;

  const grantText = [
    ...(grant.sectors ?? []),
    grant.eligibility ?? "",
    grant.description ?? "",
    grant.objectives ?? "",
  ].join(" ").toLowerCase();

  const synonymGroups: Record<string, string[]> = {
    ai: ["ai", "artificial intelligence", "machine learning", "automation"],
    technology: ["technology", "technologies", "digital", "software", "data", "ai", "innovation", "tech"],
    tech: ["technology", "technologies", "digital", "software", "data", "ai", "innovation", "tech"],
    software: ["software", "platform", "digital", "saas", "automation"],
    digital: ["digital", "software", "technology", "online", "data"],
  };

  return uniqueTerms.some((term) => {
    if (grantText.includes(term)) return true;
    return (synonymGroups[term] ?? []).some((synonym) => grantText.includes(synonym));
  });
}

function hasExplicitMeasurableProfileCriteria(grant: GuardGrant): boolean {
  const text = grantCriteriaText(grant);
  return [
    /\b(?:employee|employees|staff|fte|full[- ]time equivalent)/,
    /\b(?:revenue|turnover|income|sales|gross revenue)/,
    /\b(?:trading|operating|registered|incorporated|established)[^.;\n]{0,80}\b(?:at least|minimum|min\.?|for|within|last|under|less than|up to|max)/,
    /\b(?:at least|minimum|min\.?|under|less than|up to|max)\s+\d+(?:\.\d+)?\s+(?:years?|months?)[^.;\n]{0,80}\b(?:trading|operating|registration|incorporation|established)/,
    /\bpre[- ]?revenue\b/,
  ].some((pattern) => pattern.test(text));
}

function isSoftProfileEvidenceGap(value: string): boolean {
  return /\b(company registration age|company age|year established|registration date|trading history|revenue data|annual revenue|turnover|employee count|team size)\b/i.test(value);
}

function capResult(result: EligibilityResult, maxScore: number, reason: string, actions?: string[]): EligibilityResult {
  const current = result.score ?? result.confidence;
  if (current <= maxScore) return result;
  const score = Math.max(0, Math.min(maxScore, current));
  const missing = [...(result.missing ?? []), reason].filter((value, index, arr) => arr.indexOf(value) === index);
  const reasons = [...(result.reasons ?? []), reason].filter((value, index, arr) => arr.indexOf(value) === index);
  const currentActions = result.improvementPlan?.actions ?? [];
  const nextActions = [...currentActions, ...(actions ?? ["Review the grant criteria against your company DNA before applying."])]
    .filter((value, index, arr) => arr.indexOf(value) === index);
  return {
    ...result,
    decision: score >= 75 ? "likely_eligible" : score >= 40 ? "review" : "unlikely",
    score,
    confidence: score,
    winProbability: Math.min(result.winProbability ?? score, score),
    evidenceStrength: score >= 80 ? "strong" : score >= 55 ? "medium" : "weak",
    alignment: score >= 70 ? result.alignment ?? [] : [],
    improvementPlan:
      score >= 75
        ? result.improvementPlan
        : {
            ...(result.improvementPlan ?? {}),
            gaps: [...(result.improvementPlan?.gaps ?? []), reason].filter((value, index, arr) => arr.indexOf(value) === index),
            actions: nextActions,
            timeline: result.improvementPlan?.timeline ?? "Before applying",
          },
    missing,
    reasons,
    summary:
      result.summary && result.summary.includes(reason)
        ? result.summary
        : `${result.summary ?? result.reason ?? "Eligibility needs review"} Score capped because: ${reason}.`,
    reason:
      result.reason && result.reason.includes(reason)
        ? result.reason
        : `${result.reason ?? result.summary ?? "Eligibility needs review"} Score capped because: ${reason}.`,
  };
}

export function applyEligibilityScoreGuards(
  profile: GuardProfile,
  grant: GuardGrant,
  result: EligibilityResult
): EligibilityResult {
  let guarded = result;
  const freshness = getGrantFreshnessStatus(grant);
  if (!freshness.usable) {
    return capResult(guarded, 0, freshness.message ?? "Opportunity appears closed or temporally stale", [
      "Do not apply through this listing unless the funder confirms the programme is still open.",
    ]);
  }
  const applicantGate = getApplicantTypeGate(profile.businessType, grant);
  if (applicantGate && !applicantGate.profileMatches) {
    guarded = capResult(guarded, 25, `Applicant type mismatch: ${applicantGate.reason}`);
  }
  if (!regionMatches(profile.location, grant.regions ?? [])) {
    guarded = capResult(guarded, 20, "Region mismatch with company location");
  }
  if (!sectorLooksAligned(profile.sector, grant)) {
    guarded = capResult(guarded, 65, "Sector fit is weak or unclear");
  }
  if (!purposeLooksAligned(profile.fundingPurposes, grant)) {
    guarded = capResult(guarded, 60, "Funding purpose does not clearly match the grant objectives");
  }
  if ((guarded.score ?? guarded.confidence ?? 0) >= 85 && !hasCoreRelevanceEvidence(profile, grant)) {
    guarded = capResult(guarded, 70, "Core relevance is generic; the grant does not clearly evidence the company sector or funding priorities");
  }

  const preScreen = evaluateEligibilityPreScreen(profile, grant);
  if (preScreen.scoreCap != null && preScreen.gaps.length > 0) {
    guarded = capResult(
      guarded,
      preScreen.scoreCap,
      `Measurable eligibility pre-screen: ${preScreen.gaps.join("; ")}`,
      preScreen.actions
    );
    guarded = {
      ...guarded,
      met: [...(guarded.met ?? []), ...preScreen.met].filter((value, index, arr) => arr.indexOf(value) === index),
      missing: [...(guarded.missing ?? []), ...preScreen.gaps].filter((value, index, arr) => arr.indexOf(value) === index),
    };
  } else if (preScreen.met.length > 0) {
    guarded = {
      ...guarded,
      met: [...(guarded.met ?? []), ...preScreen.met].filter((value, index, arr) => arr.indexOf(value) === index),
    };
  }

  const explicitMeasurableCriteria = hasExplicitMeasurableProfileCriteria(grant);
  const scoreRelevantMissing = (guarded.missing ?? []).filter(
    (item) => explicitMeasurableCriteria || !isSoftProfileEvidenceGap(item)
  );
  const warningText = [...scoreRelevantMissing, ...(guarded.reasons ?? [])].join(" ").toLowerCase();
  if (/\b(sector mismatch|purpose mismatch|unrelated|not related|focus required|required expertise|required capability)\b/.test(warningText)) {
    guarded = capResult(guarded, 55, "Core grant focus does not clearly match the company DNA");
  } else if (scoreRelevantMissing.length >= 3) {
    guarded = capResult(guarded, 65, "Several eligibility gaps need evidence before this can be treated as high fit");
  }

  return guarded;
}
