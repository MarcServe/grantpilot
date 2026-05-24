import Link from "next/link";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Building2 } from "lucide-react";
import type { EligibleGrant } from "@/components/grants/eligible-grant-card";
import { EligibleGrantsList } from "@/components/grants/eligible-grants-list";
import { isGrantLinkUsable } from "@/lib/grant-freshness";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { applyEligibilityScoreGuards } from "@/lib/eligibility-score-guards";
import { applyOutcomeScoreAdjustment, deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import type { EligibilityResult } from "@/lib/claude";

const MATCH_PAGE_SIZE_OPTIONS = [20, 30, 50] as const;
const DEFAULT_MATCH_PAGE_SIZE = 30;
const MATCH_FETCH_OVERAGE = 3;

type ScoreTier = "suggested" | "within_reach" | "other";
type MatchSearchParams = Promise<{ page?: string; pageSize?: string; tier?: string }>;

function profileForEligibilityGuards(profile: Record<string, unknown>) {
  return {
    location: String(profile.location ?? ""),
    sector: String(profile.sector ?? ""),
    fundingPurposes: Array.isArray(profile.fundingPurposes) ? profile.fundingPurposes as string[] : (Array.isArray(profile.funding_purposes) ? profile.funding_purposes as string[] : []),
    businessType: String(profile.businessType ?? profile.business_type ?? "") || null,
    employeeCount: profile.employeeCount != null ? Number(profile.employeeCount) : (profile.employee_count != null ? Number(profile.employee_count) : null),
    annualRevenue: profile.annualRevenue != null ? Number(profile.annualRevenue) : (profile.annual_revenue != null ? Number(profile.annual_revenue) : null),
    yearEstablished: profile.yearEstablished != null ? Number(profile.yearEstablished) : (profile.year_established != null ? Number(profile.year_established) : null),
  };
}

function normalizePage(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function normalizePageSize(raw: string | undefined): number {
  const parsed = Number(raw);
  return (MATCH_PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_MATCH_PAGE_SIZE;
}

function normalizeTier(raw: string | undefined): ScoreTier | null {
  if (raw === "suggested" || raw === "within_reach" || raw === "other") return raw;
  return null;
}

function buildMatchesHref(page: number, pageSize: number, tier: ScoreTier | null): string {
  const params = new URLSearchParams();
  if (tier) params.set("tier", tier);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== DEFAULT_MATCH_PAGE_SIZE) params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `/grants/eligible?${query}` : "/grants/eligible";
}

function latestIsoDate(values: (string | null | undefined)[]): string | null {
  let latest: { value: string; time: number } | null = null;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) continue;
    if (!latest || time > latest.time) latest = { value, time };
  }
  return latest?.value ?? null;
}

function dateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function resolveTimeZone(value: unknown): string {
  const timeZone = typeof value === "string" && value.trim() ? value.trim() : "Europe/London";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "Europe/London";
  }
}

function formatLastScoredAt(value: string | null, timeZone: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  if (dateKey(date, timeZone) === dateKey(now, timeZone)) return `Today, ${time}`;
  if (dateKey(date, timeZone) === dateKey(yesterday, timeZone)) return `Yesterday, ${time}`;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
  }).format(date);
}

export default async function EligibleGrantsPage({
  searchParams,
}: {
  searchParams: MatchSearchParams;
}) {
  return <EligibleGrantsPageContent searchParams={searchParams} />;
}

async function EligibleGrantsPageContent({
  searchParams,
}: {
  searchParams: MatchSearchParams;
}) {
  const params = await searchParams;
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const activeTier = normalizeTier(params.tier);
  const offset = (page - 1) * pageSize;
  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const profile = org.profiles?.[0];
  const completionScore = (profile as { completionScore?: number; completion_score?: number } | undefined)?.completionScore
    ?? (profile as { completion_score?: number } | undefined)?.completion_score
    ?? 0;
  const profileId = (profile as { id?: string } | undefined)?.id;

  if (!profile || !profileId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:p-6">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Create your business profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We need your profile to match you with eligible grants.
            </p>
            <Link href="/profile" className="mt-4">
              <Button size="sm">Go to Profile <ArrowRight className="ml-1 h-3 w-3" /></Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // First try: filter by both org and profile. The tier filter is applied
  // server-side so "Suggested" fetches the suggested set, not just the
  // suggested grants that happened to be loaded on the current page.
  let assessmentsQuery = supabase
    .from("EligibilityAssessment")
    .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, updated_at, scoring_source", { count: "exact" })
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .order("score", { ascending: false });
  if (activeTier === "suggested") {
    assessmentsQuery = assessmentsQuery.gte("score", 80);
  } else if (activeTier === "within_reach") {
    assessmentsQuery = assessmentsQuery.gte("score", 50).lt("score", 80);
  } else if (activeTier === "other") {
    assessmentsQuery = assessmentsQuery.lt("score", 50);
  }

  const assessmentsResult = await assessmentsQuery.range(offset, offset + pageSize * MATCH_FETCH_OVERAGE - 1);
  let assessmentsData = assessmentsResult.data;
  const assessmentsError = assessmentsResult.error;
  let assessmentTotalCount = assessmentsResult.count ?? 0;

  // Fallback: if nothing found with profileId, try org-only query
  // (handles mismatch between profile ID in auth vs eligibility pipeline)
  if ((!assessmentsData || assessmentsData.length === 0) && !assessmentsError) {
    let fallbackQuery = supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, updated_at, profile_id, scoring_source", { count: "exact" })
      .eq("organisation_id", orgId)
      .order("score", { ascending: false });
    if (activeTier === "suggested") {
      fallbackQuery = fallbackQuery.gte("score", 80);
    } else if (activeTier === "within_reach") {
      fallbackQuery = fallbackQuery.gte("score", 50).lt("score", 80);
    } else if (activeTier === "other") {
      fallbackQuery = fallbackQuery.lt("score", 50);
    }

    const fallback = await fallbackQuery.range(offset, offset + pageSize * MATCH_FETCH_OVERAGE - 1);
    if (fallback.data && fallback.data.length > 0) {
      console.warn(`[eligible-page] profileId mismatch: page uses "${profileId}" but DB has "${(fallback.data[0] as { profile_id: string }).profile_id}" — using org-only fallback (${fallback.data.length} rows)`);
      assessmentsData = fallback.data;
      assessmentTotalCount = fallback.count ?? fallback.data.length;
    }
  }

  if (assessmentsError) {
    console.error("[eligible-page] assessments query error:", assessmentsError);
  }

  const assessments = (assessmentsData ?? []) as {
    grant_id: string;
    score: number;
    decision: string | null;
    summary: string | null;
    missing_criteria: string[] | null;
    improvement_plan: { gaps?: string[]; actions?: string[] } | null;
    updated_at: string;
    scoring_source?: string | null;
  }[];
  const [
    suggestedCountResult,
    withinReachCountResult,
    otherCountResult,
    latestScoreResult,
  ] = await Promise.all([
    supabase
      .from("EligibilityAssessment")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .gte("score", 80),
    supabase
      .from("EligibilityAssessment")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .gte("score", 50)
      .lt("score", 80),
    supabase
      .from("EligibilityAssessment")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .lt("score", 50),
    supabase
      .from("EligibilityAssessment")
      .select("updated_at")
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const grantIds = assessments.map((a) => a.grant_id);
  let grantsMap = new Map<string, { id: string; name: string; funder: string; deadline: string | null; funderLocations?: string[]; createdAt?: string | null; eligibility?: string | null; description?: string | null; objectives?: string | null; applicantTypes?: string[]; sectors?: string[]; regions?: string[] }>();
  const { data: outcomeRows } = await supabase
    .from("ApplicationOutcome")
    .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
    .eq("organisationId", orgId)
    .eq("profileId", profileId)
    .order("reportedAt", { ascending: false })
    .limit(8);
  const outcomeAdvisory = deriveOutcomeLearningAdvisory(outcomeRows ?? []);

  if (grantIds.length > 0) {
    const appliedGrantIds = await getAppliedGrantIds(supabase, orgId, profileId);
    // Batch .in() queries to avoid URL length limits (Supabase/PostgREST caps ~8KB)
    const BATCH_SIZE = 200;
    const allGrantsData: { id: string; name: string; funder: string; deadline: string | null; funderLocations?: string[]; url_status?: string; createdAt?: string | null; eligibility?: string | null; description?: string | null; objectives?: string | null; applicantTypes?: string[]; sectors?: string[]; regions?: string[] }[] = [];
    for (let i = 0; i < grantIds.length; i += BATCH_SIZE) {
      const batch = grantIds.slice(i, i + BATCH_SIZE);
      const { data: batchData, error: grantErr } = await supabase
        .from("Grant")
        .select("id, name, funder, deadline, funderLocations, url_status, createdAt, eligibility, description, objectives, applicantTypes, sectors, regions")
        .in("id", batch);
      if (grantErr) {
        console.error("[eligible-page] grants query error:", grantErr);
      }
      if (batchData) allGrantsData.push(...(batchData as typeof allGrantsData));
    }

    const validGrants = allGrantsData.filter((grant) =>
      isGrantLinkUsable(grant) && !appliedGrantIds.has(grant.id)
    );

    const userFunderLocations = inferFunderLocationsFromProfile(profile as {
      funderLocations?: string[] | null;
      location?: string | null;
      country?: string | null;
      region?: string | null;
    });
    const locationFiltered = validGrants.filter((g) =>
      grantMatchesFunderLocations(g.funderLocations, userFunderLocations)
    );

    console.info(`[eligible-page] org=${orgId} profile=${profileId}: ${assessments.length} assessments, ${allGrantsData.length} grants fetched, ${appliedGrantIds.size} already applied, ${validGrants.length} fresh/unapplied, ${locationFiltered.length} pass location filter`);

    grantsMap = new Map(locationFiltered.map((g) => [g.id, g]));
  }

  const allGrants: EligibleGrant[] = [];

  for (const a of assessments) {
    const grant = grantsMap.get(a.grant_id);
    if (!grant) continue;

    const scoringSource = a.scoring_source ?? (a.summary?.startsWith("Preliminary fit") ? "heuristic" : "openai");
    const baseScore = scoringSource === "heuristic" ? Math.min(a.score, 69) : a.score;
    const guarded = applyOutcomeScoreAdjustment(applyEligibilityScoreGuards(
      profileForEligibilityGuards(profile as Record<string, unknown>),
      grant,
      {
        decision: a.decision === "likely_eligible" || a.decision === "review" || a.decision === "unlikely" ? a.decision : "review",
        reason: a.summary ?? "",
        confidence: baseScore,
        score: baseScore,
        summary: a.summary ?? undefined,
        reasons: [],
        improvementPlan: a.improvement_plan as EligibilityResult["improvementPlan"],
        met: [],
        missing: a.missing_criteria ?? [],
        winProbability: baseScore,
        evidenceStrength: baseScore >= 80 ? "strong" : baseScore >= 55 ? "medium" : "weak",
      }
    ), outcomeAdvisory);
    const score = guarded.score ?? guarded.confidence;
    allGrants.push({
      grantId: a.grant_id,
      grantName: grant.name,
      funder: grant.funder,
      deadline: grant.deadline,
      addedAt: grant.createdAt ?? null,
      score,
      decision: guarded.decision,
      summary: guarded.summary ?? a.summary,
      missingCriteria: guarded.missing ?? a.missing_criteria,
      improvementPlan: guarded.improvementPlan ?? a.improvement_plan,
      outcomeWarnings: guarded.outcomeWarnings ?? [],
      scoringSource,
    });

  }

  const displayGrants = allGrants.slice(0, pageSize);
  const suggestedCount = suggestedCountResult.count ?? 0;
  const withinReachCount = withinReachCountResult.count ?? 0;
  const otherCount = otherCountResult.count ?? 0;
  const allScoredCount = suggestedCount + withinReachCount + otherCount;
  const totalInCurrentView = assessmentTotalCount || allGrants.length;
  const totalPages = Math.max(1, Math.ceil(totalInCurrentView / pageSize));
  const safePage = Math.min(page, totalPages);
  const timezone = resolveTimeZone((org as { preferredTimezone?: string | null }).preferredTimezone);
  const lastScoredAt = latestIsoDate([
    (latestScoreResult.data as { updated_at?: string } | null)?.updated_at ?? null,
  ]);
  const lastScoredLabel = formatLastScoredAt(lastScoredAt, timezone);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:p-6">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">My Matches</h1>
        <p className="mt-1 text-muted-foreground">
          Grants scored against your profile, ranked by eligibility.
          {allScoredCount > 0 && (
            <> {allScoredCount} grants scored{lastScoredLabel && <> · Latest score updated {lastScoredLabel}</>}.</>
          )}
        </p>
        {allScoredCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {totalPages > 1 && <span>Page {safePage} of {totalPages}</span>}
            <span className="hidden text-muted-foreground sm:inline">·</span>
            <span className="flex items-center gap-2">
              <span>Per page</span>
              {(MATCH_PAGE_SIZE_OPTIONS as readonly number[]).map((size) => (
                <Link
                  key={size}
                  href={buildMatchesHref(1, size, activeTier)}
                  className={size === pageSize ? "font-semibold text-primary" : "hover:text-foreground"}
                >
                  {size}
                </Link>
              ))}
            </span>
          </div>
        )}
      </div>

      {completionScore < 50 && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <CardContent className="flex items-center gap-3 py-4">
            <Building2 className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Profile completion: {completionScore}%
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Complete at least 50% of your profile to unlock full AI-powered matching.{" "}
                <Link href="/profile" className="font-medium underline">Complete profile</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {allScoredCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No scored grants yet</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              The eligibility pipeline runs daily at 8:30 AM in your timezone.
              Make sure your profile is at least 50% complete to start receiving matches.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/profile">
                <Button variant="outline" size="sm">Complete Profile</Button>
              </Link>
              <Link href="/grants">
                <Button size="sm">Browse All Grants</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EligibleGrantsList
          grants={displayGrants}
          counts={{ suggested: suggestedCount, withinReach: withinReachCount, other: otherCount }}
          activeTier={activeTier}
          links={{
            all: buildMatchesHref(1, pageSize, null),
            suggested: buildMatchesHref(1, pageSize, "suggested"),
            withinReach: buildMatchesHref(1, pageSize, "within_reach"),
            other: buildMatchesHref(1, pageSize, "other"),
          }}
        />
      )}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href={buildMatchesHref(Math.max(1, safePage - 1), pageSize, activeTier)}
            aria-disabled={safePage <= 1}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              safePage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-muted"
            }`}
          >
            Previous
          </Link>
          <span className="text-sm text-muted-foreground">{safePage} / {totalPages}</span>
          <Link
            href={buildMatchesHref(Math.min(totalPages, safePage + 1), pageSize, activeTier)}
            aria-disabled={safePage >= totalPages}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              safePage >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-muted"
            }`}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}
