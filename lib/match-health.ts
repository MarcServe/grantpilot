import { getSupabaseAdmin } from "@/lib/supabase";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { getSuppressedGrantIds } from "@/lib/grant-user-state";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import { finalEligibilityScore, finaliseEligibilityAssessment } from "@/lib/eligibility-final-score";
import { fetchCachedGrantRowsByIds } from "@/lib/grant-record-cache";
import type { EligibilityResult } from "@/lib/claude";

const MATCH_HEALTH_HIGH_THRESHOLD = 85;
const MATCH_HEALTH_WITHIN_REACH_MIN = 50;
const MATCH_HEALTH_DRY_SPELL_DAYS = 3;
const MATCH_HEALTH_ASSESSMENT_LIMIT = 800;
const MATCH_HEALTH_BATCH_SIZE = 50;

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type AssessmentRow = {
  grant_id: string;
  score: number | null;
  decision: string | null;
  summary: string | null;
  reasons?: string[] | null;
  missing_criteria?: string[] | null;
  improvement_plan?: EligibilityResult["improvementPlan"] | null;
  scoring_source?: string | null;
  updated_at: string | null;
  notified_at?: string | null;
};

type GrantRow = {
  id: string;
  name: string;
  funder?: string | null;
  deadline?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[];
  sectors?: string[];
  regions?: string[];
  funderLocations?: string[] | null;
  url_status?: string | null;
  createdAt?: string | null;
};

export type MatchHealthStatus = "healthy" | "dry_spell" | "needs_profile_evidence" | "no_recent_scores";

export type MatchHealthBlockerReason =
  | "missing_employee_count"
  | "missing_revenue"
  | "missing_company_age"
  | "missing_evidence"
  | "narrow_funding_purpose"
  | "sector_mismatch"
  | "geography_mismatch"
  | "applicant_type_mismatch"
  | "expired_or_unusable"
  | "applied_or_suppressed"
  | "needs_full_ai_review";

export type MatchHealthBlocker = {
  reason: MatchHealthBlockerReason;
  label: string;
  detail: string;
  count: number;
};

export type MatchHealthReport = {
  status: MatchHealthStatus;
  latestScoreAt: string | null;
  latestHighMatchAt: string | null;
  daysSinceHighMatch: number | null;
  currentHighMatches: number;
  currentWithinReach: number;
  storedHighMatches: number;
  usableCurrentGrants: number;
  locationMatchedGrants: number;
  suppressedOrApplied: number;
  profileCompletion: number;
  profileGaps: string[];
  topBlockers: MatchHealthBlocker[];
  recommendedActions: string[];
  shouldPrompt: boolean;
  promptTitle: string;
  promptBody: string;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function profileCompletion(profile: Record<string, unknown>): number {
  const value = normalizeNumber(profile.completionScore ?? profile.completion_score);
  return value == null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
}

function addCount(map: Map<MatchHealthBlockerReason, number>, reason: MatchHealthBlockerReason, amount = 1) {
  map.set(reason, (map.get(reason) ?? 0) + amount);
}

function blockerCopy(reason: MatchHealthBlockerReason): Omit<MatchHealthBlocker, "count"> {
  switch (reason) {
    case "missing_employee_count":
      return {
        reason,
        label: "Employee count is missing or weak",
        detail: "Some funders need team size or SME evidence before the AI can recommend with high confidence.",
      };
    case "missing_revenue":
      return {
        reason,
        label: "Revenue or trading evidence is missing",
        detail: "Several grants ask for turnover, trading history, or proof that the business is established enough.",
      };
    case "missing_company_age":
      return {
        reason,
        label: "Company age needs clearer evidence",
        detail: "Add registration date, trading history, or milestones so age-based criteria can be assessed.",
      };
    case "missing_evidence":
      return {
        reason,
        label: "Evidence is too thin for high confidence",
        detail: "Upload or add proof such as pilots, users, documents, partnerships, product traction, or project milestones.",
      };
    case "narrow_funding_purpose":
      return {
        reason,
        label: "Funding purpose may be too narrow",
        detail: "Broader but factual funding purposes help match grants for product, R&D, accessibility, AI, automation, and growth.",
      };
    case "sector_mismatch":
      return {
        reason,
        label: "Sector fit is often partial",
        detail: "Recent near-matches mention sector mismatch or unclear sector positioning.",
      };
    case "geography_mismatch":
      return {
        reason,
        label: "Geography or funder region blocks matches",
        detail: "Some grants are outside the profile's funder-region settings or geographic criteria.",
      };
    case "applicant_type_mismatch":
      return {
        reason,
        label: "Applicant type mismatch",
        detail: "Some grants are restricted to charities, universities, individuals, public bodies, or other entity types.",
      };
    case "expired_or_unusable":
      return {
        reason,
        label: "Expired or unverified grants removed",
        detail: "Known-expired and unusable links are blocked from Suggested and WhatsApp to protect trust.",
      };
    case "applied_or_suppressed":
      return {
        reason,
        label: "Already handled grants are hidden",
        detail: "Applied, deferred, dismissed, or viewed-in-detail grants can be suppressed from repeated alerts.",
      };
    case "needs_full_ai_review":
      return {
        reason,
        label: "Many grants still need full AI review",
        detail: "Preliminary grants can sit below 85% until a full company-DNA check confirms the match.",
      };
  }
}

function collectText(row: AssessmentRow): string {
  const parts = [
    row.summary,
    ...(row.reasons ?? []),
    ...(row.missing_criteria ?? []),
    ...(row.improvement_plan?.gaps ?? []),
    ...(row.improvement_plan?.actions ?? []),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function blockersFromAssessment(row: AssessmentRow, map: Map<MatchHealthBlockerReason, number>) {
  const text = collectText(row);
  if (/\b(employee|staff|team size|headcount|sme)\b/.test(text)) addCount(map, "missing_employee_count");
  if (/\b(revenue|turnover|income|sales|financial|trading)\b/.test(text)) addCount(map, "missing_revenue");
  if (/\b(age|year established|registration|registered|company history|trading history)\b/.test(text)) addCount(map, "missing_company_age");
  if (/\b(evidence|proof|pilot|traction|customer|partnership|milestone|certification|award|document)\b/.test(text)) addCount(map, "missing_evidence");
  if (/\b(sector|industry|purpose|focus)\b.*\b(mismatch|unclear|partial|weak|does not)\b/.test(text)) addCount(map, "sector_mismatch");
  if (/\b(region|location|geography|country)\b.*\b(mismatch|outside|not eligible|unclear)\b/.test(text)) addCount(map, "geography_mismatch");
  if (/\b(applicant type|charity|non-profit|cic|university|individual|public sector)\b.*\b(mismatch|required|restricted)\b/.test(text)) addCount(map, "applicant_type_mismatch");
  if (row.scoring_source !== "openai") addCount(map, "needs_full_ai_review");
}

function profileGaps(profile: Record<string, unknown>): string[] {
  const gaps: string[] = [];
  if (normalizeNumber(profile.employeeCount ?? profile.employee_count) == null) gaps.push("Add employee count or team size.");
  if (normalizeNumber(profile.annualRevenue ?? profile.annual_revenue) == null) gaps.push("Add annual revenue or trading-stage evidence.");
  if (normalizeNumber(profile.yearEstablished ?? profile.year_established) == null && !normalizeString(profile.registrationNumber ?? profile.registration_number)) {
    gaps.push("Add company registration date, registration number, or trading history.");
  }
  const fundingPurposes = Array.isArray(profile.fundingPurposes)
    ? profile.fundingPurposes
    : Array.isArray(profile.funding_purposes)
      ? profile.funding_purposes
      : [];
  if (fundingPurposes.length < 3) gaps.push("Broaden funding purposes using real business activities.");
  if (!normalizeString(profile.innovationCapabilities ?? profile.innovation_capabilities)) {
    gaps.push("Clarify AI, automation, product, R&D, or innovation capability evidence.");
  }
  if (!normalizeString(profile.socialImpact ?? profile.social_impact)) {
    gaps.push("Add social impact, accessibility, community, or user-benefit evidence where factual.");
  }
  if (!normalizeString(profile.teamExpertise ?? profile.team_expertise)) {
    gaps.push("Add team expertise, roles, delivery partners, or advisor evidence.");
  }
  return gaps;
}

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000)));
}

async function fetchGrantsById(supabase: SupabaseAdmin, grantIds: string[]): Promise<Map<string, GrantRow>> {
  return fetchCachedGrantRowsByIds<GrantRow>({
    supabase,
    ids: grantIds,
    select: "id, name, funder, deadline, eligibility, description, objectives, applicantTypes, sectors, regions, funderLocations, url_status, createdAt",
    batchSize: MATCH_HEALTH_BATCH_SIZE,
    ttlMs: 60_000,
    cacheNamespace: "match-health-grants",
  });
}

async function getOutcomeAdvisory(supabase: SupabaseAdmin, orgId: string, profileId: string) {
  const { data } = await supabase
    .from("ApplicationOutcome")
    .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
    .eq("organisationId", orgId)
    .eq("profileId", profileId)
    .order("reportedAt", { ascending: false })
    .limit(8);
  return deriveOutcomeLearningAdvisory(data ?? []);
}

export async function getMatchHealthReport(params: {
  supabase?: SupabaseAdmin;
  orgId: string;
  profile: Record<string, unknown> & { id?: string };
  highThreshold?: number;
  drySpellDays?: number;
  assessmentLimit?: number;
}): Promise<MatchHealthReport> {
  const supabase = params.supabase ?? getSupabaseAdmin();
  const profileId = String(params.profile.id ?? "");
  const highThreshold = params.highThreshold ?? MATCH_HEALTH_HIGH_THRESHOLD;
  const drySpellLimit = params.drySpellDays ?? MATCH_HEALTH_DRY_SPELL_DAYS;
  const assessmentLimit = Math.max(20, Math.min(params.assessmentLimit ?? MATCH_HEALTH_ASSESSMENT_LIMIT, MATCH_HEALTH_ASSESSMENT_LIMIT));
  const completion = profileCompletion(params.profile);

  if (!profileId) {
    return {
      status: "no_recent_scores",
      latestScoreAt: null,
      latestHighMatchAt: null,
      daysSinceHighMatch: null,
      currentHighMatches: 0,
      currentWithinReach: 0,
      storedHighMatches: 0,
      usableCurrentGrants: 0,
      locationMatchedGrants: 0,
      suppressedOrApplied: 0,
      profileCompletion: completion,
      profileGaps: ["Create a Business DNA profile first."],
      topBlockers: [],
      recommendedActions: ["Create and complete your Business DNA profile."],
      shouldPrompt: false,
      promptTitle: "No Business DNA profile found",
      promptBody: "Create a profile so GrantsCopilot can score grants against your business.",
    };
  }

  const { data: assessmentData, error: assessmentError } = await supabase
    .from("EligibilityAssessment")
    .select("grant_id, score, decision, summary, reasons, missing_criteria, improvement_plan, scoring_source, updated_at, notified_at")
    .eq("organisation_id", params.orgId)
    .eq("profile_id", profileId)
    .gte("score", MATCH_HEALTH_WITHIN_REACH_MIN)
    .order("updated_at", { ascending: false })
    .limit(assessmentLimit);

  if (assessmentError) {
    console.warn("[match-health] assessment lookup failed", assessmentError.message);
  }

  const assessments = ((assessmentData ?? []) as AssessmentRow[]).filter((row) => row.grant_id);
  const latestScoreAt = assessments[0]?.updated_at ?? null;
  const storedHighMatches = assessments.filter((row) => Number(row.score ?? 0) >= highThreshold).length;

  const grantMap = await fetchGrantsById(supabase, assessments.map((row) => row.grant_id));
  const [appliedGrantIds, suppressedGrantIds, outcomeAdvisory] = await Promise.all([
    getAppliedGrantIds(supabase, params.orgId, profileId),
    getSuppressedGrantIds(supabase, params.orgId, profileId),
    getOutcomeAdvisory(supabase, params.orgId, profileId),
  ]);

  const profileFunderLocations = inferFunderLocationsFromProfile(params.profile as {
    funderLocations?: string[] | null;
    location?: string | null;
    country?: string | null;
    region?: string | null;
  });

  const blockerCounts = new Map<MatchHealthBlockerReason, number>();
  let usableCurrentGrants = 0;
  let locationMatchedGrants = 0;
  let suppressedOrApplied = 0;
  let currentHighMatches = 0;
  let currentWithinReach = 0;
  let latestHighMatchAt: string | null = null;

  for (const row of assessments) {
    const grant = grantMap.get(row.grant_id);
    if (!grant) continue;
    if (!isGrantActionableNow(grant)) {
      addCount(blockerCounts, "expired_or_unusable");
      continue;
    }
    usableCurrentGrants++;
    if (appliedGrantIds.has(grant.id) || suppressedGrantIds.has(grant.id)) {
      suppressedOrApplied++;
      addCount(blockerCounts, "applied_or_suppressed");
      continue;
    }
    if (!grantMatchesFunderLocations(grant.funderLocations ?? [], profileFunderLocations)) {
      addCount(blockerCounts, "geography_mismatch");
      continue;
    }
    locationMatchedGrants++;
    const finalResult = finaliseEligibilityAssessment(params.profile, grant, row, outcomeAdvisory);
    const score = finalEligibilityScore(finalResult);
    if (score >= highThreshold) {
      currentHighMatches++;
      const highMatchFreshnessAt = grant.createdAt ?? row.notified_at ?? row.updated_at;
      if (
        highMatchFreshnessAt &&
        (!latestHighMatchAt || new Date(highMatchFreshnessAt).getTime() > new Date(latestHighMatchAt).getTime())
      ) {
        latestHighMatchAt = highMatchFreshnessAt;
      }
    } else if (score >= MATCH_HEALTH_WITHIN_REACH_MIN) {
      currentWithinReach++;
      blockersFromAssessment(row, blockerCounts);
    }
  }

  const gaps = profileGaps(params.profile);
  if (gaps.some((gap) => /employee|team/i.test(gap))) addCount(blockerCounts, "missing_employee_count");
  if (gaps.some((gap) => /revenue|trading/i.test(gap))) addCount(blockerCounts, "missing_revenue");
  if (gaps.some((gap) => /registration|company/i.test(gap))) addCount(blockerCounts, "missing_company_age");
  if (gaps.some((gap) => /funding purpose/i.test(gap))) addCount(blockerCounts, "narrow_funding_purpose");
  if (gaps.some((gap) => /evidence|expertise|impact|capability/i.test(gap))) addCount(blockerCounts, "missing_evidence");

  const topBlockers = [...blockerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ ...blockerCopy(reason), count }));

  const daysSinceHighMatch = daysSince(latestHighMatchAt);
  const daysSinceRelevantScore = daysSinceHighMatch ?? daysSince(latestScoreAt);
  const drySpell = daysSinceRelevantScore != null && daysSinceRelevantScore >= drySpellLimit;
  const status: MatchHealthStatus =
    assessments.length === 0 ? "no_recent_scores" : drySpell ? (gaps.length > 0 ? "needs_profile_evidence" : "dry_spell") : "healthy";
  const shouldPrompt =
    completion >= 50 &&
    drySpell &&
    (currentWithinReach > 0 || topBlockers.length > 0 || storedHighMatches > 0);

  const recommendedActions = [
    ...topBlockers.slice(0, 3).map((blocker) => blocker.detail),
    ...gaps.slice(0, 3),
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  return {
    status,
    latestScoreAt,
    latestHighMatchAt,
    daysSinceHighMatch: daysSinceRelevantScore,
    currentHighMatches,
    currentWithinReach,
    storedHighMatches,
    usableCurrentGrants,
    locationMatchedGrants,
    suppressedOrApplied,
    profileCompletion: completion,
    profileGaps: gaps,
    topBlockers,
    recommendedActions,
    shouldPrompt,
    promptTitle: "No new high-confidence matches yet",
    promptBody:
      currentWithinReach > 0
        ? `We found ${currentWithinReach} within-reach grants, but your Business DNA needs stronger evidence or broader factual positioning before GrantsCopilot can recommend more of them with 85%+ confidence.`
        : currentHighMatches > 0
          ? `You still have ${currentHighMatches} high-confidence matches, but there have been no fresh 85%+ opportunities in ${daysSinceHighMatch ?? drySpellLimit}+ days. Strengthening Business DNA can help future scoring qualify more real opportunities.`
          : "Your recent high-score rows are not current/actionable after expiry, location, applied, and suppression filters. Strengthening Business DNA can help future scoring qualify more real opportunities.",
  };
}
