import { getApplicantTypeGate } from "@/lib/eligibility-hard-gates";
import type { EligibilityResult } from "@/lib/claude";

interface GuardProfile {
  location: string;
  sector: string;
  fundingPurposes: string[];
  businessType?: string | null;
}

interface GuardGrant {
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

function capResult(result: EligibilityResult, maxScore: number, reason: string): EligibilityResult {
  const current = result.score ?? result.confidence;
  if (current <= maxScore) return result;
  const score = Math.max(0, Math.min(maxScore, current));
  const missing = [...(result.missing ?? []), reason].filter((value, index, arr) => arr.indexOf(value) === index);
  const reasons = [...(result.reasons ?? []), reason].filter((value, index, arr) => arr.indexOf(value) === index);
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
        : result.improvementPlan ?? {
            gaps: [reason],
            actions: ["Review the grant criteria against your company DNA before applying."],
            timeline: "Before applying",
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

  const warningText = [...(guarded.missing ?? []), ...(guarded.reasons ?? [])].join(" ").toLowerCase();
  if (/\b(sector mismatch|purpose mismatch|unrelated|not related|focus required|required expertise|required capability)\b/.test(warningText)) {
    guarded = capResult(guarded, 55, "Core grant focus does not clearly match the company DNA");
  } else if ((guarded.missing ?? []).length >= 3) {
    guarded = capResult(guarded, 65, "Several eligibility gaps need evidence before this can be treated as high fit");
  }

  return guarded;
}
