import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { getServerCache } from "@/lib/server-cache";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { getGrantVerificationWarning } from "@/lib/grant-freshness";
import { isVerifiedApplicationQuality } from "@/lib/grant-application-url-quality";
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
const GRANT_SELECT_WITH_URL_QUALITY = [
  "id",
  "name",
  "funder",
  "deadline",
  "funderLocations",
  "url_status",
  "createdAt",
  "eligibility",
  "description",
  "objectives",
  "applicantTypes",
  "sectors",
  "regions",
  "applicationUrlQuality",
  "applicationUrlKind",
  "applicationUrlQualityReason",
  "directApplicationUrl",
].join(", ");
const GRANT_SELECT_BASE = [
  "id",
  "name",
  "funder",
  "deadline",
  "funderLocations",
  "url_status",
  "createdAt",
  "eligibility",
  "description",
  "objectives",
  "applicantTypes",
  "sectors",
  "regions",
].join(", ");

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
  applicationUrlQuality?: string | null;
  applicationUrlKind?: string | null;
  applicationUrlQualityReason?: string | null;
  directApplicationUrl?: string | null;
};
type AssessmentBatch = {
  rows: AssessmentRow[];
  count: number;
  usedProfileFallback: boolean;
};
type MatchIndex = {
  byTier: Record<ScoreTier, EligibleGrant[]>;
  counts: Record<ScoreTier, number>;
  rawAssessmentCount: number;
  scannedAssessmentCount: number;
  usedProfileFallback: boolean;
};
type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;
type GrantRowsResult = {
  rows: GrantRow[];
  error: { code?: string; message?: string } | null;
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

function hasVerifiedApplicationStart(grant: GrantRow): boolean {
  return isVerifiedApplicationQuality(grant.applicationUrlQuality);
}

function hashIds(ids: string[]): string {
  return createHash("sha1").update(ids.slice().sort().join(",")).digest("hex").slice(0, 16);
}

async function fetchGrantRowsByIds(
  supabase: SupabaseAdmin,
  ids: string[],
  select: string
): Promise<GrantRowsResult> {
  const rows: GrantRow[] = [];
  for (let i = 0; i < ids.length; i += GRANT_QUERY_BATCH_SIZE) {
    const batch = ids.slice(i, i + GRANT_QUERY_BATCH_SIZE);
    const { data, error } = await supabase.from("Grant").select(select).in("id", batch);
    if (error) return { rows: [], error };
    rows.push(...((data ?? []) as unknown as GrantRow[]));
  }
  return { rows, error: null };
}

async function fetchEligibleGrantRowsByIds(
  supabase: SupabaseAdmin,
  ids: string[]
): Promise<Map<string, GrantRow>> {
  const cacheKey = `eligible-grants-rows:v1:${hashIds(ids)}`;

  return getServerCache(cacheKey, { ttlMs: 60_000, maxEntries: 100 }, async () => {
    const full = await fetchGrantRowsByIds(supabase, ids, GRANT_SELECT_WITH_URL_QUALITY);
    if (!full.error) {
      return new Map(full.rows.map((row) => [row.id, row]));
    }

    const missingUrlQualityColumns =
      full.error.code === "42703" ||
      /applicationUrlQuality|applicationUrlKind|directApplicationUrl|column .* does not exist/i.test(full.error.message ?? "");

    if (!missingUrlQualityColumns) {
      console.warn("[eligible-matches] Grant lookup failed:", full.error.message ?? full.error);
      return new Map<string, GrantRow>();
    }

    console.warn("[eligible-matches] URL quality columns unavailable; using base Grant columns for non-suggested tiers");
    const fallback = await fetchGrantRowsByIds(supabase, ids, GRANT_SELECT_BASE);
    if (fallback.error) {
      console.warn("[eligible-matches] Grant fallback lookup failed:", fallback.error.message ?? fallback.error);
      return new Map<string, GrantRow>();
    }
    return new Map(fallback.rows.map((row) => [row.id, row]));
  });
}

async function queryAssessmentBatch({
  orgId,
  profileId,
  limit,
}: {
  orgId: string;
  profileId: string;
  limit: number;
}): Promise<AssessmentBatch> {
  const supabase = getSupabaseAdmin();
  const cacheKey = `eligible-match-assessments:v3:${orgId}:${profileId}:${limit}`;
  return getServerCache(cacheKey, { ttlMs: 30_000, maxEntries: 200 }, async () => {
    const withProfile = supabase
      .from("EligibilityAssessment")
      .select(ASSESSMENT_SELECT, { count: "exact" })
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
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

    const orgOnly = supabase
      .from("EligibilityAssessment")
      .select(ASSESSMENT_SELECT, { count: "exact" })
      .eq("organisation_id", orgId)
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

async function buildMatchIndex({
  orgId,
  profile,
  profileId,
}: {
  orgId: string;
  profile: Record<string, unknown>;
  profileId: string;
}): Promise<MatchIndex> {
  const supabase = getSupabaseAdmin();
  const cacheKey = `eligible-match-index:v1:${orgId}:${profileId}`;

  return getServerCache(cacheKey, { ttlMs: 30_000, maxEntries: 100 }, async () => {
    const assessmentsPromise = queryAssessmentBatch({ orgId, profileId, limit: MAX_MATCH_ASSESSMENTS });
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
    const grantIds = [...new Set(assessments.map((assessment) => assessment.grant_id))];
    const byTier: Record<ScoreTier, EligibleGrant[]> = {
      suggested: [],
      within_reach: [],
      other: [],
    };

    if (grantIds.length === 0) {
      return {
        byTier,
        counts: {
          suggested: 0,
          within_reach: 0,
          other: 0,
        },
        rawAssessmentCount: assessmentBatch.count,
        scannedAssessmentCount: assessments.length,
        usedProfileFallback: assessmentBatch.usedProfileFallback,
      };
    }

    const savedStatePromise = supabase
      .from("SavedGrant")
      .select("grant_id, status")
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .in("grant_id", grantIds);
    const grantsPromise = fetchEligibleGrantRowsByIds(supabase, grantIds);

    const [savedStateResult, grantsById] = await Promise.all([savedStatePromise, grantsPromise]);
    const savedRows = (savedStateResult.data ?? []) as SavedGrantStateRow[];
    const grantUserStateMap = new Map(
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
    const outcomeAdvisory = deriveOutcomeLearningAdvisory(outcomeResult.data ?? []);
    const seenGrantIds = new Set<string>();

    for (const assessment of assessments) {
      if (seenGrantIds.has(assessment.grant_id)) continue;
      const grant = grantsById.get(assessment.grant_id);
      if (!grant) continue;
      if (!isGrantActionableNow(grant)) continue;
      if (appliedGrantIds.has(grant.id)) continue;
      if (hiddenStateGrantIds.has(grant.id)) continue;
      if (!grantMatchesFunderLocations(grant.funderLocations, userFunderLocations)) continue;

      const scoringSource = resolveScoringSource(assessment);
      const guarded = finaliseEligibilityAssessment(profile, grant, assessment, outcomeAdvisory);
      const score = finalEligibilityScore(guarded);
      const finalTier = tierForScore(score);
      if (finalTier === "suggested" && !hasVerifiedApplicationStart(grant)) continue;

      seenGrantIds.add(assessment.grant_id);
      byTier[finalTier].push({
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
        applicationUrlQuality: grant.applicationUrlQuality ?? null,
        applicationUrlKind: grant.applicationUrlKind ?? null,
        applicationUrlQualityReason: grant.applicationUrlQualityReason ?? null,
        scoringSource,
        userState: grantUserStateMap.get(assessment.grant_id) ?? null,
      });
    }

    for (const grants of Object.values(byTier)) {
      grants.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const bScoredTime = b.scoredAt ? new Date(b.scoredAt).getTime() : 0;
        const aScoredTime = a.scoredAt ? new Date(a.scoredAt).getTime() : 0;
        if (bScoredTime !== aScoredTime) return bScoredTime - aScoredTime;
        const bTime = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        const aTime = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        return bTime - aTime;
      });
    }

    return {
      byTier,
      counts: {
        suggested: byTier.suggested.length,
        within_reach: byTier.within_reach.length,
        other: byTier.other.length,
      },
      rawAssessmentCount: assessmentBatch.count,
      scannedAssessmentCount: assessments.length,
      usedProfileFallback: assessmentBatch.usedProfileFallback,
    };
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tier = normalizeTier(url.searchParams.get("tier"));
    const page = normalizePage(url.searchParams.get("page"));
    const pageSize = normalizePageSize(url.searchParams.get("pageSize"));
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    const profileId = (profile as { id?: string } | undefined)?.id;

    if (!profile || !profileId) {
      return NextResponse.json({ error: "Profile required" }, { status: 400 });
    }

    const matchIndex = await buildMatchIndex({ orgId, profile: profile as Record<string, unknown>, profileId });
    const grants = matchIndex.byTier[tier];
    const offset = (page - 1) * pageSize;
    const pageEnd = page * pageSize;
    const pageGrants = grants.slice(offset, pageEnd);
    const availableCandidateCount = matchIndex.counts[tier];
    const hasMore = availableCandidateCount > pageEnd;

    return NextResponse.json(
      {
        grants: pageGrants,
        page,
        pageSize,
        tier,
        hasMore,
        availableCandidateCount,
        rawCandidateCount: availableCandidateCount,
        rawAssessmentCount: matchIndex.rawAssessmentCount,
        scannedCandidateCount: matchIndex.scannedAssessmentCount,
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
