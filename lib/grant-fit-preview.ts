import { getSupabaseAdmin } from "@/lib/supabase";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { activeSectionForScore, isTrustedMatchScoringSource, type GrantUserState } from "@/lib/eligible-match-rules";
import { grantIntelligenceFromDb, isReadyGrantIntelligence, type GrantIntelligence, type GrantIntelligenceDbRow } from "@/lib/grant-intelligence-schema";
import { applyEligibilityScoreGuards } from "@/lib/eligibility-score-guards";
import { applyOutcomeScoreAdjustment, deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import { confirmedEligibilityFactsToText, eligibilityFactsToText } from "@/lib/eligibility-facts";
import { estimateGrantEffort, type GrantEffortSignal } from "@/lib/grant-effort";
import { deriveDecisionSignals, type ConfidenceState, type ScoreDimensions } from "@/lib/grant-decision-signals";
import { resolveGrantFundingValue, type GrantFundingValue } from "@/lib/grant-value";
import type { EligibilityResult } from "@/lib/claude";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export type GrantFitTagState = "met" | "possible" | "blocked" | "neutral";
export type GrantFitTagKind = "sector" | "region" | "applicant";

export const GRANT_FIT_PREVIEW_SELECT_BASE = [
  "id",
  "name",
  "funder",
  "amount",
  "deadline",
  "eligibility",
  "description",
  "objectives",
  "applicantTypes",
  "sectors",
  "regions",
  "funderLocations",
  "url_status",
  "createdAt",
].join(", ");

export const GRANT_FIT_PREVIEW_SELECT_WITH_DECISION = [
  GRANT_FIT_PREVIEW_SELECT_BASE,
  "applicationUrl",
  "detailUrl",
  "directApplicationUrl",
  "applicationUrlQuality",
  "applicationUrlKind",
  "opportunityType",
  "fundingValueType",
  "applicantMaxAmount",
  "applicantTypicalAmount",
  "programmeTotalAmount",
  "fundingValueEvidence",
].join(", ");

export function isGrantFitPreviewColumnError(message: string | null | undefined): boolean {
  return /applicationUrlQuality|applicationUrlKind|directApplicationUrl|detailUrl|opportunityType|fundingValueType|applicantMaxAmount|applicantTypicalAmount|programmeTotalAmount|fundingValueEvidence|column .* does not exist/i.test(message ?? "");
}

export type GrantFitTag = {
  kind: GrantFitTagKind;
  label: string;
  state: GrantFitTagState;
  explanation: string;
};

export type GrantFitPreview = {
  grantId: string;
  targetSummary: string | null;
  opportunityType: string | null;
  score: number | null;
  summary: string | null;
  scoringSource: string | null;
  matchSection: "suggested" | "within_reach" | "other" | "needs_review" | "reviewed" | "unscored";
  missingCriteria: string[];
  suppressionReason: string | null;
  whyNotSuggested: string[];
  tagExplanations: GrantFitTag[];
  fundingValue: GrantFundingValue;
  scoreDimensions: ScoreDimensions | null;
  confidenceState: ConfidenceState | null;
  recommendationCategory: string | null;
  primaryBlocker: string | null;
  nextAction: string | null;
  profileFactsNeeded: string[];
  effort: GrantEffortSignal | null;
};

export type GrantFitAssessmentRow = {
  grant_id: string;
  score: number | null;
  decision?: string | null;
  summary?: string | null;
  reasons?: string[] | null;
  alignment?: string[] | null;
  missing_criteria?: string[] | null;
  improvement_plan?: { gaps?: string[]; actions?: string[]; timeline?: string } | null;
  scoring_source?: string | null;
  updated_at?: string | null;
};

export type GrantFitPreviewGrant = {
  id: string;
  name?: string | null;
  funder?: string | null;
  amount?: number | null;
  deadline?: string | Date | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[] | null;
  sectors?: string[] | null;
  regions?: string[] | null;
  funderLocations?: string[] | null;
  url_status?: string | null;
  urlStatus?: string | null;
  applicationUrl?: string | null;
  detailUrl?: string | null;
  directApplicationUrl?: string | null;
  applicationUrlQuality?: string | null;
  applicationUrlKind?: string | null;
  opportunityType?: string | null;
  fundingValue?: GrantFundingValue | null;
  fundingValueType?: string | null;
  applicantMaxAmount?: number | null;
  applicantTypicalAmount?: number | null;
  programmeTotalAmount?: number | null;
  fundingValueEvidence?: string | null;
  createdAt?: string | null;
};

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text) return text.length > 220 ? `${text.slice(0, 217).trim()}...` : text;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = String(item ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result.slice(0, 12);
}

function extractedString(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function opportunityTypeFromIntelligence(intelligence: GrantIntelligence | null, grant?: GrantFitPreviewGrant): string | null {
  const criteria = intelligence?.extractedCriteria ?? {};
  const raw =
    extractedString(criteria, "opportunityType") ??
    extractedString(criteria, "opportunity_type") ??
    grant?.opportunityType ??
    null;
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ");
  if (normalized.includes("loan")) return "Loan";
  if (normalized.includes("innovation competition")) return "Innovation competition";
  if (normalized.includes("accelerator")) return "Accelerator";
  if (normalized.includes("business support")) return "Business support";
  if (normalized.includes("software") || normalized.includes("startup perk")) return "Startup perk";
  if (normalized.includes("procurement") || normalized.includes("contract")) return "Procurement / contract";
  if (normalized.includes("grant")) return "Grant";
  return raw;
}

function collectMissingCriteria(row: GrantFitAssessmentRow | null): string[] {
  const gaps = stringArray(row?.improvement_plan?.gaps);
  const missing = stringArray(row?.missing_criteria);
  return [...missing, ...gaps].filter((value, index, list) =>
    list.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index
  ).slice(0, 6);
}

function textCorpus(...values: unknown[]): string {
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase();
}

function tokenOverlap(label: string, corpus: string): boolean {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !["and", "the", "for", "with", "from"].includes(word));
  if (words.length === 0) return false;
  return words.some((word) => corpus.includes(word));
}

function profileApplicantTerms(profile: Record<string, unknown> | null | undefined): string[] {
  const corpus = textCorpus(
    profile?.businessType,
    profile?.business_type,
    profile?.legalStructure,
    profile?.legal_structure,
    profile?.businessStage,
    profile?.business_stage,
    profile?.businessSizeBand,
    profile?.business_size_band,
    profile?.founderEmploymentStatus,
    profile?.founder_employment_status,
    profile?.previousGrantExperience,
    profile?.previous_grant_experience,
    eligibilityFactsToText(profile?.eligibilityFacts ?? profile?.eligibility_facts),
    profile?.businessName,
    profile?.business_name,
    profile?.description,
    profile?.sector
  );
  const employeeCount = Number(profile?.employeeCount ?? profile?.employee_count);
  const terms = ["business", "company", "organisation"];
  if (/startup|start-up|early stage|pre[- ]?seed|seed|founder/.test(corpus)) terms.push("startup", "start-up", "early stage");
  if (/growth|scale[- ]?up|scaling/.test(corpus)) terms.push("growth business", "scaleup", "scale-up");
  if (/established|trading/.test(corpus)) terms.push("established business", "trading business");
  if (/sme|small|micro|medium/.test(corpus) || (Number.isFinite(employeeCount) && employeeCount >= 0 && employeeCount <= 250)) {
    terms.push("sme", "small business", "micro business", "medium business");
  }
  if (/limited|ltd|company/.test(corpus)) terms.push("limited company");
  if (/sole trader|self[- ]?employed|freelancer/.test(corpus)) terms.push("sole trader", "self-employed", "individual");
  if (/charity|nonprofit|not-for-profit|cic/.test(corpus)) terms.push("charity", "nonprofit", "not-for-profit", "cic");
  if (/university|academic|research/.test(corpus)) terms.push("university", "academic", "researcher");
  return Array.from(new Set(terms));
}

function profileRegionLabels(profile: Record<string, unknown> | null | undefined, explicitFunderLocations: string[]): string[] {
  const inferred = explicitFunderLocations.length
    ? explicitFunderLocations
    : inferFunderLocationsFromProfile(profile as { funderLocations?: string[] | null; location?: string | null; country?: string | null; region?: string | null; localAuthority?: string | null; areasServed?: string | null } | undefined);
  const text = textCorpus(
    profile?.location,
    profile?.country,
    profile?.region,
    profile?.localAuthority,
    profile?.local_authority,
    profile?.areasServed,
    profile?.areas_served,
    profile?.postcode,
    profile?.city,
    inferred
  );
  const labels = [...inferred, profile?.localAuthority, profile?.local_authority, profile?.region, profile?.city]
    .map((label) => String(label ?? "").trim())
    .filter(Boolean);
  if (/\buk|united kingdom|england|scotland|wales|northern ireland|bristol|london|somerset|devon|cornwall|gloucestershire|staffordshire|worcestershire|west midlands|south west|southwest|south east|southeast/.test(text)) {
    labels.push("UK", "United Kingdom", "England");
  }
  if (/\bswitzerland|swiss/.test(text)) labels.push("Switzerland", "Swiss");
  if (/\beu|europe/.test(text)) labels.push("EU", "Europe");
  if (/\bglobal|international|worldwide/.test(text)) labels.push("Global", "International");
  return Array.from(new Set(labels.map((label) => label.toLowerCase())));
}

function multipleRegionMandatory(intelligence: GrantIntelligence | null, regions: string[]): boolean {
  const text = textCorpus(intelligence?.hardGates, intelligence?.eligibilityCriteria, intelligence?.exclusions, regions);
  return (
    /\bboth\b.{0,80}\b(uk|united kingdom|switzerland|swiss|eu|europe)\b/.test(text) ||
    /\bmust\b.{0,80}\b(uk|united kingdom)\b.{0,80}\b(and|&)\b.{0,80}\b(switzerland|swiss)\b/.test(text) ||
    /\bmust\b.{0,80}\b(switzerland|swiss)\b.{0,80}\b(and|&)\b.{0,80}\b(uk|united kingdom)\b/.test(text)
  );
}

function regionTagState(label: string, profile: Record<string, unknown> | null | undefined, userFunderLocations: string[], grant: GrantFitPreviewGrant, intelligence: GrantIntelligence | null): GrantFitTag {
  const profileRegions = profileRegionLabels(profile, userFunderLocations);
  const normalizedLabel = label.toLowerCase();
  const profileMatches = profileRegions.some((region) => normalizedLabel.includes(region) || region.includes(normalizedLabel));
  const grantLocations = grant.funderLocations ?? [];
  const overallMatch = grantMatchesFunderLocations(grantLocations, userFunderLocations);
  const mandatoryMultiple = multipleRegionMandatory(intelligence, grant.regions ?? []);

  if (profileMatches || (overallMatch && /global|international|worldwide/.test(normalizedLabel))) {
    return {
      kind: "region",
      label,
      state: "met",
      explanation: `${label} appears compatible with this Business DNA. Region tags are treated as any matching eligible region unless the funder states multiple regions are mandatory.`,
    };
  }

  if (mandatoryMultiple) {
    return {
      kind: "region",
      label,
      state: "blocked",
      explanation: `${label} may be mandatory with another region. Add evidence or confirm the funder accepts applicants from your exact location before relying on this match.`,
    };
  }

  return {
    kind: "region",
    label,
    state: profile ? "possible" : "neutral",
    explanation: `${label} is listed on the grant. If any listed eligible region is enough, another matching region may still qualify the profile.`,
  };
}

function applicantTagState(label: string, profile: Record<string, unknown> | null | undefined, intelligence: GrantIntelligence | null): GrantFitTag {
  const normalized = label.toLowerCase();
  const terms = profileApplicantTerms(profile);
  const meets = terms.some((term) => normalized.includes(term) || term.includes(normalized));
  const hardText = textCorpus(intelligence?.hardGates, intelligence?.exclusions, intelligence?.eligibilityCriteria);
  const restricted =
    (/individual|student|household|charity|nonprofit|not-for-profit|university|academic|researcher/.test(normalized) ||
      /only|must be|restricted/.test(hardText)) &&
    !meets &&
    !(/business|company|sme|startup|start-up/.test(normalized) && terms.some((term) => /business|company|sme|startup|start-up/.test(term)));

  if (meets) {
    return {
      kind: "applicant",
      label,
      state: "met",
      explanation: `The Business DNA appears to match the ${label} applicant type.`,
    };
  }
  if (restricted) {
    return {
      kind: "applicant",
      label,
      state: "blocked",
      explanation: `${label} may be a hard applicant requirement. The profile does not currently show clear evidence for it.`,
    };
  }
  return {
    kind: "applicant",
    label,
    state: profile ? "possible" : "neutral",
    explanation: `${label} may be relevant, but the Business DNA needs clearer evidence before this can be treated as a confirmed match.`,
  };
}

function sectorTagState(label: string, profile: Record<string, unknown> | null | undefined, intelligence: GrantIntelligence | null): GrantFitTag {
  const corpus = textCorpus(
    profile?.sector,
    profile?.description,
    profile?.missionStatement,
    profile?.mission_statement,
    profile?.fundingPurposes,
    profile?.funding_purposes,
    profile?.preferredOpportunityTypes,
    profile?.preferred_opportunity_types,
    profile?.fundingDetails,
    profile?.funding_details,
    profile?.innovationCapabilities,
    profile?.innovation_capabilities,
    profile?.socialImpact,
    profile?.social_impact,
    profile?.sustainabilityInitiatives,
    profile?.sustainability_initiatives,
    profile?.communityEngagement,
    profile?.community_engagement,
    eligibilityFactsToText(profile?.eligibilityFacts ?? profile?.eligibility_facts)
  );
  const match = tokenOverlap(label, corpus);
  const intelligenceText = textCorpus(intelligence?.sectors, intelligence?.semanticTags, intelligence?.fundingPurposes);

  if (match) {
    return {
      kind: "sector",
      label,
      state: "met",
      explanation: `The Business DNA includes language related to ${label}.`,
    };
  }
  if (intelligenceText.includes(label.toLowerCase()) && profile) {
    return {
      kind: "sector",
      label,
      state: "possible",
      explanation: `${label} is part of the extracted grant target. Add clearer Business DNA evidence if this is a real focus area.`,
    };
  }
  return {
    kind: "sector",
    label,
    state: "neutral",
    explanation: `${label} describes the grant theme. It is informational unless the grant criteria make it a hard requirement.`,
  };
}

function buildTagExplanations(
  grant: GrantFitPreviewGrant,
  profile: Record<string, unknown> | null | undefined,
  userFunderLocations: string[],
  intelligence: GrantIntelligence | null
): GrantFitTag[] {
  const tags: GrantFitTag[] = [];
  for (const sector of (grant.sectors ?? []).slice(0, 6)) tags.push(sectorTagState(sector, profile, intelligence));
  for (const region of (grant.regions ?? []).slice(0, 6)) tags.push(regionTagState(region, profile, userFunderLocations, grant, intelligence));
  for (const applicant of (grant.applicantTypes ?? []).slice(0, 6)) tags.push(applicantTagState(applicant, profile, intelligence));
  return tags;
}

function profileForEligibilityGuards(profile: Record<string, unknown>) {
  return {
    location: String(profile.location ?? ""),
    sector: String(profile.sector ?? ""),
    fundingPurposes: Array.isArray(profile.fundingPurposes) ? profile.fundingPurposes as string[] : (Array.isArray(profile.funding_purposes) ? profile.funding_purposes as string[] : []),
    businessType: String(profile.businessType ?? profile.business_type ?? "") || null,
    legalStructure: String(profile.legalStructure ?? profile.legal_structure ?? "") || null,
    businessStage: String(profile.businessStage ?? profile.business_stage ?? "") || null,
    businessSizeBand: String(profile.businessSizeBand ?? profile.business_size_band ?? "") || null,
    founderEmploymentStatus: String(profile.founderEmploymentStatus ?? profile.founder_employment_status ?? "") || null,
    localAuthority: String(profile.localAuthority ?? profile.local_authority ?? "") || null,
    areasServed: String(profile.areasServed ?? profile.areas_served ?? "") || null,
    expectedEmployeeGrowth: String(profile.expectedEmployeeGrowth ?? profile.expected_employee_growth ?? "") || null,
    coFundingCapacity: String(profile.coFundingCapacity ?? profile.co_funding_capacity ?? "") || null,
    reimbursementReadiness: String(profile.reimbursementReadiness ?? profile.reimbursement_readiness ?? "") || null,
    coFundingAvailable: String(profile.coFundingAvailable ?? profile.co_funding_available ?? "") || null,
    matchFundingDetails: String(profile.matchFundingDetails ?? profile.match_funding_details ?? "") || null,
    eligibilityFactsText: eligibilityFactsToText(profile.eligibilityFacts ?? profile.eligibility_facts),
    confirmedEligibilityFactsText: confirmedEligibilityFactsToText(profile.eligibilityFacts ?? profile.eligibility_facts),
    employeeCount: profile.employeeCount != null ? Number(profile.employeeCount) : (profile.employee_count != null ? Number(profile.employee_count) : null),
    annualRevenue: profile.annualRevenue != null ? Number(profile.annualRevenue) : (profile.annual_revenue != null ? Number(profile.annual_revenue) : null),
    yearEstablished: profile.yearEstablished != null ? Number(profile.yearEstablished) : (profile.year_established != null ? Number(profile.year_established) : null),
    incorporationDate: String(profile.incorporationDate ?? profile.incorporation_date ?? "") || null,
    tradingStartDate: String(profile.tradingStartDate ?? profile.trading_start_date ?? "") || null,
  };
}

function finaliseAssessmentScore(params: {
  profile: Record<string, unknown>;
  grant: GrantFitPreviewGrant;
  assessment: GrantFitAssessmentRow;
  outcomeRows: unknown[];
}): { score: number; summary: string | null; scoringSource: string | null; missingCriteria: string[] } {
  const source = params.assessment.scoring_source ?? (params.assessment.summary?.startsWith("Preliminary fit") ? "heuristic" : "openai");
  const baseScore = params.assessment.score == null
    ? 0
    : source === "heuristic"
      ? Math.min(params.assessment.score, 69)
      : params.assessment.score;
  const result = applyOutcomeScoreAdjustment(applyEligibilityScoreGuards(
    profileForEligibilityGuards(params.profile),
    {
      ...params.grant,
      applicantTypes: params.grant.applicantTypes ?? [],
      sectors: params.grant.sectors ?? [],
      regions: params.grant.regions ?? [],
    },
    {
      decision: params.assessment.decision === "likely_eligible" || params.assessment.decision === "review" || params.assessment.decision === "unlikely" ? params.assessment.decision : "review",
      reason: params.assessment.summary ?? "",
      confidence: baseScore,
      score: baseScore,
      summary: params.assessment.summary ?? undefined,
      reasons: params.assessment.reasons ?? [],
      improvementPlan: params.assessment.improvement_plan as EligibilityResult["improvementPlan"],
      met: [],
      missing: params.assessment.missing_criteria ?? [],
      winProbability: baseScore,
      evidenceStrength: baseScore >= 80 ? "strong" : baseScore >= 55 ? "medium" : "weak",
    }
  ), deriveOutcomeLearningAdvisory(params.outcomeRows));

  return {
    score: result.score ?? result.confidence,
    summary: result.summary ?? params.assessment.summary ?? null,
    scoringSource: source,
    missingCriteria: collectMissingCriteria(params.assessment),
  };
}

function buildSuppressionReason(params: {
  userState?: GrantUserState | null;
  isApplied?: boolean;
  actionable: boolean;
  locationMatched: boolean;
  urlStatus?: string | null;
}): string | null {
  if (params.isApplied || params.userState === "applied") return "Already started or applied, so it is removed from active recommendations.";
  if (params.userState === "deferred") return "Deferred for later, so it is removed from active recommendations until you revisit it.";
  if (params.userState === "dismissed") return "Dismissed, so it is suppressed from active recommendations.";
  if (params.userState === "viewed") return "Viewed before. It stays available in Reviewed but no longer clogs active Suggested.";
  if (!params.actionable) return "Expired, closed, or not currently actionable.";
  if (params.urlStatus === "dead" || params.urlStatus === "expired") return "The source link is marked unavailable or expired.";
  if (!params.locationMatched) return "The grant funder region does not match the profile's selected regions.";
  return null;
}

function buildWhyNotSuggested(params: {
  assessment: GrantFitAssessmentRow | null;
  score: number | null;
  scoringSource: string | null;
  missingCriteria: string[];
  suppressionReason: string | null;
  locationMatched: boolean;
  actionable: boolean;
  intelligence: GrantIntelligence | null;
}): string[] {
  const reasons: string[] = [];
  if (params.suppressionReason) reasons.push(params.suppressionReason);
  if (!params.actionable) reasons.push("This grant is not currently usable, so it is kept out of active My Matches.");
  if (!params.locationMatched) reasons.push("Location or funder-region does not match the Business DNA.");
  if (!params.assessment) {
    reasons.push("Not AI-scored for this profile yet.");
  } else if (!isTrustedMatchScoringSource(params.scoringSource)) {
    reasons.push("Needs full AI review before it can become a trusted match.");
  } else if ((params.score ?? 0) < 85) {
    reasons.push(`AI score is ${params.score ?? 0}%, below the 85% Suggested threshold.`);
  }
  for (const item of params.missingCriteria.slice(0, 3)) {
    reasons.push(`Missing or weak evidence: ${item}`);
  }
  if (params.intelligence?.freshness.status === "stale") {
    reasons.push("Grant intelligence marks this source as stale.");
  }
  return reasons.filter((value, index, list) => list.indexOf(value) === index).slice(0, 6);
}

function resolveMatchSection(params: {
  assessment: GrantFitAssessmentRow | null;
  score: number | null;
  scoringSource: string | null;
  userState?: GrantUserState | null;
}): GrantFitPreview["matchSection"] {
  if (params.userState === "viewed") return "reviewed";
  if (!params.assessment || params.score == null) return "unscored";
  if (!isTrustedMatchScoringSource(params.scoringSource)) return "needs_review";
  return activeSectionForScore(params.score);
}

function buildPreview(params: {
  grant: GrantFitPreviewGrant;
  profile?: Record<string, unknown> | null;
  userFunderLocations: string[];
  assessment: GrantFitAssessmentRow | null;
  intelligence: GrantIntelligence | null;
  outcomeRows: unknown[];
  userState?: GrantUserState | null;
  isApplied?: boolean;
}): GrantFitPreview {
  const finalized = params.profile && params.assessment
    ? finaliseAssessmentScore({
        profile: params.profile,
        grant: params.grant,
        assessment: params.assessment,
        outcomeRows: params.outcomeRows,
      })
    : {
        score: params.assessment?.score ?? null,
        summary: params.assessment?.summary ?? null,
        scoringSource: params.assessment?.scoring_source ?? null,
        missingCriteria: collectMissingCriteria(params.assessment),
      };
  const actionable = isGrantActionableNow(params.grant);
  const locationMatched = grantMatchesFunderLocations(params.grant.funderLocations ?? [], params.userFunderLocations);
  const urlStatus = params.grant.url_status ?? params.grant.urlStatus ?? null;
  const fundingValue = resolveGrantFundingValue(params.grant);
  const suppressionReason = buildSuppressionReason({
    userState: params.userState,
    isApplied: params.isApplied,
    actionable,
    locationMatched,
    urlStatus,
  });
  const matchSection = resolveMatchSection({
    assessment: params.assessment,
    score: finalized.score,
    scoringSource: finalized.scoringSource,
    userState: params.userState,
  });
  const targetSummary = firstText(
    params.intelligence?.reusableSummary,
    params.grant.objectives,
    params.grant.description,
    params.grant.eligibility
  );
  const effort = finalized.score == null
    ? null
    : estimateGrantEffort({
        amount: fundingValue.countsTowardApplicantTotal ? fundingValue.amount : params.grant.amount ?? null,
        deadline: params.grant.deadline ? String(params.grant.deadline) : null,
        applicationUrlQuality: params.grant.applicationUrlQuality ?? null,
        applicationUrlKind: params.grant.applicationUrlKind ?? null,
        eligibility: params.grant.eligibility,
        description: params.grant.description,
        objectives: params.grant.objectives,
        score: finalized.score,
        scoringSource: finalized.scoringSource,
        missingCriteria: finalized.missingCriteria,
        improvementPlan: params.assessment?.improvement_plan ?? null,
      });
  const decisionSignals = finalized.score == null
    ? null
    : deriveDecisionSignals({
        score: finalized.score,
        scoringSource: finalized.scoringSource,
        missingCriteria: finalized.missingCriteria,
        improvementPlan: params.assessment?.improvement_plan ?? null,
        effort,
        userState: params.userState,
        suppressionReason,
      });

  return {
    grantId: params.grant.id,
    targetSummary,
    opportunityType: opportunityTypeFromIntelligence(params.intelligence, params.grant),
    score: finalized.score,
    summary: finalized.summary,
    scoringSource: finalized.scoringSource,
    matchSection,
    missingCriteria: finalized.missingCriteria,
    suppressionReason,
    whyNotSuggested: buildWhyNotSuggested({
      assessment: params.assessment,
      score: finalized.score,
      scoringSource: finalized.scoringSource,
      missingCriteria: finalized.missingCriteria,
      suppressionReason,
      locationMatched,
      actionable,
      intelligence: params.intelligence,
    }),
    tagExplanations: buildTagExplanations(params.grant, params.profile, params.userFunderLocations, params.intelligence),
    fundingValue,
    scoreDimensions: decisionSignals?.scoreDimensions ?? null,
    confidenceState: decisionSignals?.confidenceState ?? null,
    recommendationCategory: decisionSignals?.recommendationCategory ?? null,
    primaryBlocker: decisionSignals?.primaryBlocker ?? null,
    nextAction: decisionSignals?.nextAction ?? null,
    profileFactsNeeded: decisionSignals?.profileFactsNeeded ?? [],
    effort,
  };
}

export async function getGrantFitPreviews(options: {
  supabase?: SupabaseAdmin;
  organisationId: string;
  profile?: Record<string, unknown> | null;
  grants: GrantFitPreviewGrant[];
  userFunderLocations?: string[];
  grantUserStates?: Record<string, GrantUserState | null>;
  appliedGrantIds?: Set<string>;
}): Promise<Record<string, GrantFitPreview>> {
  const grants = options.grants.filter((grant) => grant.id);
  if (grants.length === 0) return {};
  const supabase = options.supabase ?? getSupabaseAdmin();
  const grantIds = grants.map((grant) => grant.id);
  const profileId = options.profile?.id ? String(options.profile.id) : null;
  const userFunderLocations = options.userFunderLocations ?? inferFunderLocationsFromProfile(options.profile as {
    funderLocations?: string[] | null;
    location?: string | null;
    country?: string | null;
    region?: string | null;
    localAuthority?: string | null;
    areasServed?: string | null;
  } | undefined);

  const [intelligenceResult, assessmentResult, outcomeResult] = await Promise.all([
    supabase
      .from("grant_ai_intelligence")
      .select("grant_id, status, model, confidence, reusable_summary, extracted_criteria, eligibility_criteria, hard_gates, applicant_types, sectors, regions, funding_purposes, semantic_tags, measurable_requirements, exclusions, freshness, scoring_hints, reusable_prompt, extraction_error")
      .in("grant_id", grantIds),
    profileId
      ? supabase
          .from("EligibilityAssessment")
          .select("grant_id, score, decision, summary, reasons, alignment, improvement_plan, missing_criteria, scoring_source, updated_at")
          .eq("organisation_id", options.organisationId)
          .eq("profile_id", profileId)
          .in("grant_id", grantIds)
      : Promise.resolve({ data: [], error: null }),
    profileId
      ? supabase
          .from("ApplicationOutcome")
          .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
          .eq("organisationId", options.organisationId)
          .eq("profileId", profileId)
          .order("reportedAt", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (intelligenceResult.error) {
    console.warn("[grant-fit-preview] grant intelligence lookup failed:", intelligenceResult.error.message);
  }
  if (assessmentResult.error) {
    console.warn("[grant-fit-preview] assessment lookup failed:", assessmentResult.error.message);
  }
  if (outcomeResult.error) {
    console.warn("[grant-fit-preview] outcome lookup failed:", outcomeResult.error.message);
  }

  const intelligenceByGrantId = new Map<string, GrantIntelligence>();
  for (const row of (intelligenceResult.data ?? []) as GrantIntelligenceDbRow[]) {
    const intelligence = grantIntelligenceFromDb(row);
    if (isReadyGrantIntelligence(intelligence)) intelligenceByGrantId.set(row.grant_id, intelligence);
  }
  const assessmentByGrantId = new Map<string, GrantFitAssessmentRow>();
  for (const row of (assessmentResult.data ?? []) as GrantFitAssessmentRow[]) {
    if (row.grant_id) assessmentByGrantId.set(row.grant_id, row);
  }

  const previews: Record<string, GrantFitPreview> = {};
  for (const grant of grants) {
    previews[grant.id] = buildPreview({
      grant,
      profile: options.profile,
      userFunderLocations,
      assessment: assessmentByGrantId.get(grant.id) ?? null,
      intelligence: intelligenceByGrantId.get(grant.id) ?? null,
      outcomeRows: outcomeResult.data ?? [],
      userState: options.grantUserStates?.[grant.id] ?? null,
      isApplied: options.appliedGrantIds?.has(grant.id) ?? false,
    });
  }

  return previews;
}
