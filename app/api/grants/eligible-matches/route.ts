import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { getServerCache } from "@/lib/server-cache";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { getGrantVerificationWarning } from "@/lib/grant-freshness";
import { deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import {
  finalEligibilityScore,
  finaliseEligibilityAssessment,
  resolveScoringSource,
} from "@/lib/eligibility-final-score";
import {
  matchSectionAllowsCandidate,
  normalizeEligibleMatchSection,
  scoreBelongsToMatchSection,
  sortEligibleMatchesForSection,
  type EligibleMatchSection,
  type GrantUserState,
} from "@/lib/eligible-match-rules";
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
  "applicationUrl",
  "detailUrl",
  "directApplicationUrl",
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
].join(", ");
const GRANT_SELECT_BASE = [
  "id",
  "name",
  "funder",
  "deadline",
  "funderLocations",
  "url_status",
  "applicationUrl",
  "createdAt",
  "eligibility",
  "description",
  "objectives",
  "applicantTypes",
  "sectors",
  "regions",
].join(", ");

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
  applicationUrl?: string | null;
  detailUrl?: string | null;
  directApplicationUrl?: string | null;
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
};
type AssessmentBatch = {
  rows: AssessmentRow[];
  count: number;
  usedProfileFallback: boolean;
};
type TierMatchResult = {
  grants: EligibleGrant[];
  availableCandidateCount: number;
  availableCandidateCountIsEstimate: boolean;
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

function applySectionScoreFilter<T>(query: T, section: EligibleMatchSection): T {
  type ScoreFilterChain = {
    gte: (column: string, value: number) => T;
    lt: (column: string, value: number) => T;
  };
  const chain = query as ScoreFilterChain;
  if (section === "suggested") return chain.gte("score", 85);
  if (section === "within_reach") {
    return (chain.gte("score", 50) as ScoreFilterChain).lt("score", 85);
  }
  if (section === "other") return chain.lt("score", 50);
  return chain.gte("score", 1);
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
  const cacheKey = `eligible-grants-rows:v2:${hashIds(ids)}`;

  return getServerCache(cacheKey, { ttlMs: 60_000, maxEntries: 100 }, async () => {
    const full = await fetchGrantRowsByIds(supabase, ids, GRANT_SELECT_WITH_URL_QUALITY);
    if (!full.error) {
      return new Map(full.rows.map((row) => [row.id, row]));
    }

    const missingUrlQualityColumns =
      full.error.code === "42703" ||
      /applicationUrlQuality|applicationUrlKind|directApplicationUrl|detailUrl|column .* does not exist/i.test(full.error.message ?? "");

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
  section,
  from,
  to,
}: {
  orgId: string;
  profileId: string;
  section: EligibleMatchSection;
  from: number;
  to: number;
}): Promise<AssessmentBatch> {
  const supabase = getSupabaseAdmin();
  const cacheKey = `eligible-match-assessments:v7:${orgId}:${profileId}:${section}:${from}:${to}`;
  return getServerCache(cacheKey, { ttlMs: 30_000, maxEntries: 200 }, async () => {
    let withProfile = applySectionScoreFilter(
      supabase
        .from("EligibilityAssessment")
        .select(ASSESSMENT_SELECT, { count: "exact" })
        .eq("organisation_id", orgId)
        .eq("profile_id", profileId),
      section
    );
    withProfile = section === "within_reach"
      ? withProfile.order("updated_at", { ascending: false }).order("score", { ascending: false })
      : withProfile.order("score", { ascending: false }).order("updated_at", { ascending: false });
    withProfile = withProfile.range(from, to);

    const primary = await withProfile;
    if (primary.error) {
      console.error("[eligible-matches] assessment query error:", primary.error);
    }
    if ((primary.count ?? primary.data?.length ?? 0) > 0) {
      return {
        rows: (primary.data ?? []) as AssessmentRow[],
        count: primary.count ?? primary.data?.length ?? 0,
        usedProfileFallback: false,
      };
    }

    let orgOnly = applySectionScoreFilter(
      supabase
        .from("EligibilityAssessment")
        .select(ASSESSMENT_SELECT, { count: "exact" })
        .eq("organisation_id", orgId),
      section
    );
    orgOnly = section === "within_reach"
      ? orgOnly.order("updated_at", { ascending: false }).order("score", { ascending: false })
      : orgOnly.order("score", { ascending: false }).order("updated_at", { ascending: false });
    orgOnly = orgOnly.range(from, to);

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

async function buildTierMatches({
  orgId,
  profile,
  profileId,
  section,
  page,
  pageSize,
}: {
  orgId: string;
  profile: Record<string, unknown>;
  profileId: string;
  section: EligibleMatchSection;
  page: number;
  pageSize: number;
}): Promise<TierMatchResult> {
  const supabase = getSupabaseAdmin();
  const cacheKey = `eligible-match-tier:v5:${orgId}:${profileId}:${section}:${page}:${pageSize}`;

  return getServerCache(cacheKey, { ttlMs: 30_000, maxEntries: 100 }, async () => {
    const outcomePromise = supabase
      .from("ApplicationOutcome")
      .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
      .eq("organisationId", orgId)
      .eq("profileId", profileId)
      .order("reportedAt", { ascending: false })
      .limit(8);
    const appliedPromise = getAppliedGrantIds(supabase, orgId, profileId);
    const savedStatePromise = supabase
      .from("SavedGrant")
      .select("grant_id, status")
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId);

    const [outcomeResult, appliedGrantIds, savedStateResult] = await Promise.all([
      outcomePromise,
      appliedPromise,
      savedStatePromise,
    ]);

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
    const matches: EligibleGrant[] = [];
    let rawAssessmentCount = 0;
    let scannedAssessmentCount = 0;
    let usedProfileFallback = false;

    while (scannedAssessmentCount < MAX_MATCH_ASSESSMENTS) {
      const batchFrom = scannedAssessmentCount;
      const batchTo = Math.min(MAX_MATCH_ASSESSMENTS, batchFrom + GRANT_QUERY_BATCH_SIZE) - 1;
      const assessmentBatch = await queryAssessmentBatch({ orgId, profileId, section, from: batchFrom, to: batchTo });
      rawAssessmentCount = assessmentBatch.count;
      usedProfileFallback = usedProfileFallback || assessmentBatch.usedProfileFallback;

      if (assessmentBatch.usedProfileFallback) {
        console.warn(`[eligible-matches] profileId mismatch: page uses "${profileId}" but org-only fallback returned rows`);
      }

      const assessments = assessmentBatch.rows;
      scannedAssessmentCount += assessments.length;
      if (assessments.length === 0) break;

      const grantIds = [...new Set(assessments.map((assessment) => assessment.grant_id))];
      const grantsById = await fetchEligibleGrantRowsByIds(supabase, grantIds);

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
        const userState = grantUserStateMap.get(assessment.grant_id) ?? null;
        if (!scoreBelongsToMatchSection(section, score)) continue;
        if (!matchSectionAllowsCandidate({ section, userState, scoringSource })) continue;

        seenGrantIds.add(assessment.grant_id);
        matches.push({
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
          applicationUrl: grant.applicationUrl ?? null,
          detailUrl: grant.detailUrl ?? null,
          directApplicationUrl: grant.directApplicationUrl ?? null,
          applicationUrlQuality: grant.applicationUrlQuality ?? null,
          applicationUrlKind: grant.applicationUrlKind ?? null,
          applicationUrlQualityReason: grant.applicationUrlQualityReason ?? null,
          scoringSource,
          userState,
        });
      }

      if (scannedAssessmentCount >= rawAssessmentCount) break;
    }

    matches.sort((a, b) => sortEligibleMatchesForSection(section, a, b));

    const pageEnd = page * pageSize;
    const scanComplete = scannedAssessmentCount >= rawAssessmentCount || scannedAssessmentCount >= MAX_MATCH_ASSESSMENTS;
    const hasMoreVisible = matches.length > pageEnd;

    return {
      grants: matches,
      availableCandidateCount: scanComplete ? matches.length : Math.max(matches.length, pageEnd + (hasMoreVisible ? 1 : 0)),
      availableCandidateCountIsEstimate: !scanComplete,
      rawAssessmentCount,
      scannedAssessmentCount,
      usedProfileFallback,
    };
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tier = normalizeEligibleMatchSection(url.searchParams.get("tier"));
    const page = normalizePage(url.searchParams.get("page"));
    const pageSize = normalizePageSize(url.searchParams.get("pageSize"));
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    const profileId = (profile as { id?: string } | undefined)?.id;

    if (!profile || !profileId) {
      return NextResponse.json({ error: "Profile required" }, { status: 400 });
    }

    const tierMatches = await buildTierMatches({
      orgId,
      profile: profile as Record<string, unknown>,
      profileId,
      section: tier,
      page,
      pageSize,
    });
    const grants = tierMatches.grants;
    const offset = (page - 1) * pageSize;
    const pageEnd = page * pageSize;
    const pageGrants = grants.slice(offset, pageEnd);
    const availableCandidateCount = tierMatches.availableCandidateCount;
    const hasMore = grants.length > pageEnd || tierMatches.availableCandidateCountIsEstimate;

    return NextResponse.json(
      {
        grants: pageGrants,
        page,
        pageSize,
        tier,
        hasMore,
        availableCandidateCount,
        availableCandidateCountIsEstimate: tierMatches.availableCandidateCountIsEstimate,
        rawCandidateCount: availableCandidateCount,
        rawAssessmentCount: tierMatches.rawAssessmentCount,
        scannedCandidateCount: tierMatches.scannedAssessmentCount,
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
