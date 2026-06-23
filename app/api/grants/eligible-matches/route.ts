import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { getServerCache } from "@/lib/server-cache";
import { fetchCachedGrantRowsByIds } from "@/lib/grant-record-cache";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { getGrantVerificationWarning } from "@/lib/grant-freshness";
import { deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import {
  finalEligibilityScore,
  finaliseEligibilityAssessment,
  resolveScoringSource,
} from "@/lib/eligibility-final-score";
import type { EligibleGrant } from "@/components/grants/eligible-grant-card";

const MATCH_PAGE_SIZE_OPTIONS = [20, 30, 50] as const;
const DEFAULT_MATCH_PAGE_SIZE = 20;
const MAX_MATCH_ASSESSMENTS = 800;
const GRANT_QUERY_BATCH_SIZE = 80;
const ASSESSMENT_SELECT = "grant_id, score, decision, summary, missing_criteria, improvement_plan, updated_at, profile_id, scoring_source";

type ScoreTier = "suggested" | "within_reach" | "other";
type GrantUserState = "saved" | "viewed" | "deferred" | "applied" | "dismissed";
type AssessmentRow = {
  grant_id: string;
  score: number;
  decision: string | null;
  summary: string | null;
  missing_criteria: string[] | null;
  improvement_plan: { gaps?: string[]; actions?: string[] } | null;
  updated_at: string;
  profile_id?: string | null;
  scoring_source?: string | null;
};
type SavedGrantStateRow = {
  grant_id: string;
  status: GrantUserState | null;
};
type GrantRow = {
  id: string;
  name: string;
  funder: string;
  deadline: string | null;
  funderLocations?: string[];
  url_status?: string | null;
  createdAt?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[];
  sectors?: string[];
  regions?: string[];
};
type AssessmentBatch = {
  rows: AssessmentRow[];
  count: number;
  usedProfileFallback: boolean;
};

function normalizePage(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function normalizePageSize(raw: string | null): number {
  const parsed = Number(raw);
  return (MATCH_PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_MATCH_PAGE_SIZE;
}

function normalizeTier(raw: string | null): ScoreTier {
  if (raw === "within_reach" || raw === "other") return raw;
  return "suggested";
}

function tierForScore(score: number): ScoreTier {
  if (score >= 85) return "suggested";
  if (score >= 50) return "within_reach";
  return "other";
}

function scanLimitFor(page: number, pageSize: number): number {
  return Math.min(MAX_MATCH_ASSESSMENTS, Math.max(page * pageSize * 4, pageSize + 40));
}

function applyTierFilter<T>(query: T, tier: ScoreTier): T {
  type ScoreFilterChain = {
    gte: (column: string, value: number) => T;
    lt: (column: string, value: number) => T;
  };
  const chain = query as ScoreFilterChain;
  if (tier === "suggested") return chain.gte("score", 85);
  if (tier === "within_reach") {
    return (chain.gte("score", 50) as ScoreFilterChain).lt("score", 85);
  }
  return chain.lt("score", 50);
}

async function queryAssessmentBatch({
  orgId,
  profileId,
  tier,
  limit,
}: {
  orgId: string;
  profileId: string;
  tier: ScoreTier;
  limit: number;
}): Promise<AssessmentBatch> {
  const supabase = getSupabaseAdmin();
  const cacheKey = `eligible-match-assessments:v2:${orgId}:${profileId}:${tier}:${limit}`;
  return getServerCache(cacheKey, { ttlMs: 30_000, maxEntries: 200 }, async () => {
    const withProfile = applyTierFilter(
      supabase
        .from("EligibilityAssessment")
        .select(ASSESSMENT_SELECT, { count: "exact" })
        .eq("organisation_id", orgId)
        .eq("profile_id", profileId),
      tier
    )
      .order("score", { ascending: false })
      .order("updated_at", { ascending: false })
      .range(0, limit - 1);

    const primary = await withProfile;
    if (primary.error) {
      console.error("[eligible-matches] assessment query error:", primary.error);
    }
    if (primary.data && primary.data.length > 0) {
      return {
        rows: primary.data as AssessmentRow[],
        count: primary.count ?? primary.data.length,
        usedProfileFallback: false,
      };
    }

    const orgOnly = applyTierFilter(
      supabase
        .from("EligibilityAssessment")
        .select(ASSESSMENT_SELECT, { count: "exact" })
        .eq("organisation_id", orgId),
      tier
    )
      .order("score", { ascending: false })
      .order("updated_at", { ascending: false })
      .range(0, limit - 1);

    const fallback = await orgOnly;
    if (fallback.error) {
      console.error("[eligible-matches] assessment fallback query error:", fallback.error);
    }
    return {
      rows: (fallback.data ?? []) as AssessmentRow[],
      count: fallback.count ?? fallback.data?.length ?? 0,
      usedProfileFallback: Boolean(fallback.data?.length),
    };
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tier = normalizeTier(url.searchParams.get("tier"));
    const page = normalizePage(url.searchParams.get("page"));
    const pageSize = normalizePageSize(url.searchParams.get("pageSize"));
    const limit = scanLimitFor(page, pageSize);
    const visibleLimit = page * pageSize;
    const supabase = getSupabaseAdmin();
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    const profileId = (profile as { id?: string } | undefined)?.id;

    if (!profile || !profileId) {
      return NextResponse.json({ error: "Profile required" }, { status: 400 });
    }

    const assessmentsPromise = queryAssessmentBatch({ orgId, profileId, tier, limit });
    const outcomePromise = supabase
      .from("ApplicationOutcome")
      .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
      .eq("organisationId", orgId)
      .eq("profileId", profileId)
      .order("reportedAt", { ascending: false })
      .limit(8);
    const appliedPromise = getAppliedGrantIds(supabase, orgId, profileId);

    const [assessmentBatch, outcomeResult, appliedGrantIds] = await Promise.all([
      assessmentsPromise,
      outcomePromise,
      appliedPromise,
    ]);

    if (assessmentBatch.usedProfileFallback) {
      console.warn(`[eligible-matches] profileId mismatch: page uses "${profileId}" but org-only fallback returned rows`);
    }

    const assessments = assessmentBatch.rows;
    const grantIds = assessments.map((assessment) => assessment.grant_id);
    let grantUserStateMap = new Map<string, GrantUserState>();
    let grantsMap = new Map<string, GrantRow>();

    if (grantIds.length > 0) {
      const savedStatePromise = supabase
        .from("SavedGrant")
        .select("grant_id, status")
        .eq("organisation_id", orgId)
        .eq("profile_id", profileId)
        .in("grant_id", grantIds);
      const grantsPromise = fetchCachedGrantRowsByIds<GrantRow>({
        supabase,
        ids: grantIds,
        select: "id, name, funder, deadline, funderLocations, url_status, createdAt, eligibility, description, objectives, applicantTypes, sectors, regions",
        batchSize: GRANT_QUERY_BATCH_SIZE,
        ttlMs: 60_000,
        cacheNamespace: "eligible-grants",
      });

      const [savedStateResult, grantsById] = await Promise.all([savedStatePromise, grantsPromise]);
      const savedRows = (savedStateResult.data ?? []) as SavedGrantStateRow[];
      grantUserStateMap = new Map(
        savedRows
          .filter((row) => row.grant_id)
          .map((row) => [row.grant_id, (row.status ?? "saved") as GrantUserState])
      );
      const hiddenStateGrantIds = new Set(
        savedRows
          .filter((row) => row.status === "deferred" || row.status === "applied" || row.status === "dismissed")
          .map((row) => row.grant_id)
      );
      const userFunderLocations = inferFunderLocationsFromProfile(profile as {
        funderLocations?: string[] | null;
        location?: string | null;
        country?: string | null;
        region?: string | null;
      });
      const validGrants = [...grantsById.values()].filter((grant) =>
        isGrantActionableNow(grant) &&
        !appliedGrantIds.has(grant.id) &&
        !hiddenStateGrantIds.has(grant.id) &&
        grantMatchesFunderLocations(grant.funderLocations, userFunderLocations)
      );
      grantsMap = new Map(validGrants.map((grant) => [grant.id, grant]));
    }

    const outcomeAdvisory = deriveOutcomeLearningAdvisory(outcomeResult.data ?? []);
    const grants: EligibleGrant[] = [];

    for (const assessment of assessments) {
      const grant = grantsMap.get(assessment.grant_id);
      if (!grant) continue;

      const scoringSource = resolveScoringSource(assessment);
      const guarded = finaliseEligibilityAssessment(profile as Record<string, unknown>, grant, assessment, outcomeAdvisory);
      const score = finalEligibilityScore(guarded);
      if (tierForScore(score) !== tier) continue;

      grants.push({
        grantId: assessment.grant_id,
        grantName: grant.name,
        funder: grant.funder,
        deadline: grant.deadline,
        addedAt: grant.createdAt ?? null,
        scoredAt: assessment.updated_at ?? null,
        score,
        decision: guarded.decision,
        summary: guarded.summary ?? assessment.summary,
        missingCriteria: guarded.missing ?? assessment.missing_criteria,
        improvementPlan: guarded.improvementPlan ?? assessment.improvement_plan,
        outcomeWarnings: guarded.outcomeWarnings ?? [],
        verificationWarning: getGrantVerificationWarning(grant)?.message ?? null,
        scoringSource,
        userState: grantUserStateMap.get(assessment.grant_id) ?? null,
      });
    }

    grants.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bScoredTime = b.scoredAt ? new Date(b.scoredAt).getTime() : 0;
      const aScoredTime = a.scoredAt ? new Date(a.scoredAt).getTime() : 0;
      if (bScoredTime !== aScoredTime) return bScoredTime - aScoredTime;
      const bTime = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      const aTime = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      return bTime - aTime;
    });

    const pageGrants = grants.slice(0, visibleLimit);
    const hasMore = grants.length > visibleLimit || (limit < MAX_MATCH_ASSESSMENTS && assessmentBatch.count > limit);
    return NextResponse.json(
      {
        grants: pageGrants,
        page,
        pageSize,
        tier,
        hasMore,
        rawCandidateCount: assessmentBatch.count,
        scannedCandidateCount: assessments.length,
        returnedCount: pageGrants.length,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
        },
      }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[eligible-matches] failed to load matches:", error);
    return NextResponse.json({ error: "Unable to load matches" }, { status: 500 });
  }
}
