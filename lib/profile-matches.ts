import { createHash } from "node:crypto";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import {
  grantMatchesFunderLocations,
  inferFunderLocationsFromProfile,
} from "@/lib/constants";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import {
  finaliseEligibilityAssessment,
  finalEligibilityScore,
  resolveScoringSource,
  type EligibilityAssessmentLike,
} from "@/lib/eligibility-final-score";
import { deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import { resolveGrantFundingValue } from "@/lib/grant-value";
import { estimateGrantEffort } from "@/lib/grant-effort";
import { deriveDecisionSignals } from "@/lib/grant-decision-signals";
import { getGrantVerificationWarning } from "@/lib/grant-freshness";
import {
  activeSectionForScore,
  matchSectionAllowsCandidate,
  sortEligibleMatchesForSection,
  type EligibleMatchSection,
  type GrantUserState,
} from "@/lib/eligible-match-rules";
import { criteriaEnabled } from "@/lib/criteria-flags";
import { loadCriteria } from "@/lib/criteria-store";
import { missingFactImpact } from "@/lib/criteria";
import type { EligibleGrant } from "@/components/grants/eligible-grant-card";
export const MATCH_SECTIONS: EligibleMatchSection[] = [
  "suggested",
  "within_reach",
  "other",
  "needs_review",
  "reviewed",
];
type Assessment = EligibilityAssessmentLike & {
  grant_id: string;
  updated_at: string;
  met_criteria?: string[];
};

/** One profile, one evaluated portfolio, then section/pagination. Never use another profile's scores. */
export async function loadProfileMatches(
  orgId: string,
  profileId: string,
  db = getSupabaseAdmin(),
) {
  const profileResult = await db
    .from("BusinessProfile")
    .select("*")
    .eq("id", profileId)
    .eq("organisationId", orgId)
    .single();
  if (profileResult.error || !profileResult.data)
    throw new Error("Profile not found");
  const profile = profileResult.data as Record<string, unknown>;
  const assessments: Assessment[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("EligibilityAssessment")
      .select("*")
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .order("grant_id")
      .range(offset, offset + 499);
    if (error) throw new Error(error.message);
    assessments.push(...((data ?? []) as Assessment[]));
    if ((data?.length ?? 0) < 500) break;
  }
  const [saved, applied, outcomes] = await Promise.all([
    db
      .from("SavedGrant")
      .select("grant_id,status")
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId),
    getAppliedGrantIds(db, orgId, profileId),
    db
      .from("ApplicationOutcome")
      .select(
        "outcome,awardedAmount,funderFeedback,learningNotes,Grant(name,funder)",
      )
      .eq("organisationId", orgId)
      .eq("profileId", profileId)
      .order("reportedAt", { ascending: false })
      .limit(8),
  ]);
  if (saved.error || outcomes.error)
    throw new Error(saved.error?.message ?? outcomes.error?.message);
  const states = new Map<string, GrantUserState>(
    (saved.data ?? []).map((r) => [r.grant_id, r.status]),
  );
  const ids = [...new Set(assessments.map((a) => a.grant_id))];
  const criteria = criteriaEnabled()
    ? await loadCriteria(orgId, profileId, ids, db)
    : null;
  const sections: Record<EligibleMatchSection, EligibleGrant[]> = {
    suggested: [],
    within_reach: [],
    other: [],
    needs_review: [],
    reviewed: [],
  };
  const advisory = deriveOutcomeLearningAdvisory(outcomes.data ?? []);
  const assessmentById = new Map(assessments.map((a) => [a.grant_id, a]));
  const locations = inferFunderLocationsFromProfile(profile);
  const versions: string[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const { data: grants, error } = await db
      .from("Grant")
      .select("*")
      .in("id", ids.slice(i, i + 80));
    if (error) throw new Error(error.message);
    for (const grant of grants ?? []) {
      if (
        !isGrantActionableNow(grant) ||
        applied.has(grant.id) ||
        !grantMatchesFunderLocations(grant.funderLocations, locations)
      )
        continue;
      const assessment = assessmentById.get(grant.id)!;
      const source = resolveScoringSource(assessment);
      const guarded = finaliseEligibilityAssessment(
        profile,
        grant,
        { ...assessment, met: assessment.met_criteria },
        advisory,
      );
      const checked = criteria?.assess(grant.id, profile);
      const rawScore = finalEligibilityScore(guarded);
      const failed = checked?.criteria.some(
        (c) => c.mandatory && c.status === "not_met",
      );
      const score = checked
        ? Math.min(rawScore, failed ? 39 : checked.strongEligible ? 100 : 84)
        : rawScore;
      const userState = states.get(grant.id) ?? null;
      const section: EligibleMatchSection =
        userState === "viewed"
          ? "reviewed"
          : source === "openai" || source === "intelligence"
            ? activeSectionForScore(score)
            : "needs_review";
      if (
        !matchSectionAllowsCandidate({
          section,
          userState,
          scoringSource: source,
        })
      )
        continue;
      const missing = checked
        ? checked.criteria
            .filter(
              (c) => c.status === "needs_information" || c.status === "not_met",
            )
            .map((c) => c.label)
        : (guarded.missing ?? []);
      const plan = checked
        ? {
            gaps: missing,
            actions: checked.criteria
              .filter((c) => c.status === "needs_information")
              .map((c) => c.question),
          }
        : guarded.improvementPlan;
      const fundingValue = resolveGrantFundingValue(grant);
      const effort = estimateGrantEffort({
        ...grant,
        amount: fundingValue.countsTowardApplicantTotal
          ? fundingValue.amount
          : null,
        score,
        missingCriteria: missing,
        improvementPlan: plan,
      });
      const signals = deriveDecisionSignals({
        score,
        scoringSource: source,
        missingCriteria: missing,
        improvementPlan: plan,
        effort,
        userState,
      });
      const doc = criteria?.documents.get(grant.id);
      sections[section].push({
        grantId: grant.id,
        grantName: grant.name,
        funder: grant.funder,
        amount: fundingValue.amount,
        fundingValue,
        deadline: grant.deadline,
        addedAt: grant.createdAt,
        scoredAt: assessment.updated_at,
        score,
        decision: failed
          ? "unlikely"
          : checked && !checked.strongEligible
            ? "review"
            : guarded.decision,
        summary: checked?.summary ?? guarded.summary ?? null,
        missingCriteria: missing,
        improvementPlan: plan ?? null,
        outcomeWarnings: guarded.outcomeWarnings,
        verificationWarning: getGrantVerificationWarning(grant)?.message,
        applicationUrl: grant.applicationUrl,
        detailUrl: grant.detailUrl,
        directApplicationUrl: grant.directApplicationUrl,
        applicationUrlQuality: grant.applicationUrlQuality,
        applicationUrlKind: grant.applicationUrlKind,
        applicationUrlQualityReason: grant.applicationUrlQualityReason,
        scoringSource: source,
        userState,
        effort,
        ...signals,
        criteriaAssessment: checked,
        opportunityType: grant.opportunityType ?? "unknown",
        currency:
          grant.currency ??
          doc?.terms.find(
            (t) => /currency/i.test(t.label) && /^[A-Z]{3}$/.test(t.value),
          )?.value ??
          null,
        fundingTerms: doc?.terms ?? [],
      });
      versions.push(
        JSON.stringify([
          grant,
          assessment.updated_at,
          checked ?? "legacy",
          score,
          userState,
        ]),
      );
    }
  }
  MATCH_SECTIONS.forEach((s) =>
    sections[s].sort((a, b) => sortEligibleMatchesForSection(s, a, b)),
  );
  const counts = Object.fromEntries(
    MATCH_SECTIONS.map((s) => [s, sections[s].length]),
  ) as Record<EligibleMatchSection, number>;
  const active = [
    ...sections.suggested,
    ...sections.within_reach,
    ...sections.other,
    ...sections.needs_review,
  ];
  return {
    profile,
    sections,
    counts,
    version: createHash("sha256")
      .update(JSON.stringify([profile, versions.sort()]))
      .digest("hex")
      .slice(0, 24),
    missingFacts: missingFactImpact(
      active.flatMap((g) =>
        g.criteriaAssessment
          ? [{ grantId: g.grantId, assessment: g.criteriaAssessment }]
          : [],
      ),
    ),
  };
}

export const getProfileMatches = cache((orgId: string, profileId: string) =>
  loadProfileMatches(orgId, profileId),
);
export function pageProfileMatches(
  portfolio: Awaited<ReturnType<typeof loadProfileMatches>>,
  tier: EligibleMatchSection,
  page: number,
  pageSize: number,
) {
  const all = portfolio.sections[tier];
  const start = (page - 1) * pageSize;
  return {
    grants: all.slice(start, start + pageSize),
    availableCandidateCount: all.length,
    hasMore: all.length > start + pageSize,
    counts: portfolio.counts,
    version: portfolio.version,
  };
}
