import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { GrantsListClient } from "@/components/grants/grants-list-client";
import { computeUrgency } from "@/lib/urgency";
import { getGrantVerificationWarning, isGrantLinkUsable } from "@/lib/grant-freshness";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { applyEligibilityScoreGuards } from "@/lib/eligibility-score-guards";
import { applyOutcomeScoreAdjustment, deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import type { EligibilityResult } from "@/lib/claude";

const GRANT_PAGE_SIZE_OPTIONS = [20, 30, 50] as const;
const DEFAULT_GRANT_PAGE_SIZE = 30;
const GRANT_FETCH_OVERAGE = 3;

type GrantsSearchParams = Promise<Record<string, string | string[] | undefined>>;
type GrantSortMode = "newest" | "recommended" | "deadline";
type GrantUserState = "saved" | "viewed" | "deferred" | "applied" | "dismissed";
type SavedGrantStateRow = {
  grant_id: string;
  status: GrantUserState | null;
};
type GrantListRow = {
  id: string;
  name: string;
  funder: string;
  amount?: number | null;
  deadline?: string | null;
  sectors?: string[] | null;
  regions?: string[] | null;
  applicantTypes?: string[] | null;
  funderLocations?: string[] | null;
  source?: string | null;
  eligibility?: string | null;
  applicationUrl?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  url_status?: string | null;
  url_checked_at?: string | null;
};

function latestDate(values: (string | null)[]): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    if (!latest) return value;
    return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
  }, null);
}

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

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizePageSize(value: string | undefined): number {
  const parsed = parsePositiveInt(value, DEFAULT_GRANT_PAGE_SIZE);
  return (GRANT_PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_GRANT_PAGE_SIZE;
}

function normalizeSort(value: string | undefined): GrantSortMode {
  if (value === "recommended" || value === "deadline") return value;
  return "newest";
}

export default async function GrantsPage({
  searchParams,
}: {
  searchParams?: GrantsSearchParams;
}) {
  const params = (await searchParams) ?? {};
  const page = parsePositiveInt(firstParam(params.page), 1);
  const pageSize = normalizePageSize(firstParam(params.pageSize));
  const sortMode = normalizeSort(firstParam(params.sort));
  const regionFilter = firstParam(params.region) ?? "";
  const funderFilter = firstParam(params.funder) ?? "";
  const hideExpired = firstParam(params.hideExpired) !== "0";
  const hideBroken = firstParam(params.hideBroken) === "1";

  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const profile = org.profiles?.[0];
  const hasProfile = !!profile;
  const profileComplete = (profile?.completionScore ?? 0) >= 50;
  const userFunderLocations = inferFunderLocationsFromProfile(profile as {
    funderLocations?: string[] | null;
    location?: string | null;
    country?: string | null;
    region?: string | null;
  } | undefined);
  const appliedGrantIds = profile ? await getAppliedGrantIds(supabase, orgId, profile.id) : new Set<string>();
  const savedGrantIds: string[] = [];
  const grantUserStates: Record<string, GrantUserState> = {};
  if (profileComplete && profile) {
    const { data: savedData } = await supabase
      .from("SavedGrant")
      .select("grant_id, status")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id);
    const savedRows = (savedData ?? []) as SavedGrantStateRow[];
    for (const row of savedRows) {
      if (!row.grant_id) continue;
      const status = row.status ?? "saved";
      grantUserStates[row.grant_id] = status;
      if (status === "saved") savedGrantIds.push(row.grant_id);
    }
  }

  const [
    latestCreatedResult,
    latestUpdatedResult,
    newTodayResult,
    newThisWeekResult,
    funderOptionsResult,
  ] = await Promise.all([
    supabase.from("Grant").select("createdAt").order("createdAt", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("Grant").select("updatedAt, createdAt").order("updatedAt", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("Grant").select("id", { count: "exact", head: true }).gte("createdAt", startOfToday.toISOString()),
    supabase.from("Grant").select("id", { count: "exact", head: true }).gte("createdAt", startOfWeek.toISOString()),
    supabase.from("Grant").select("funder").order("funder", { ascending: true }).limit(500),
  ]);

  const grantColumns = [
    "id",
    "name",
    "funder",
    "amount",
    "deadline",
    "sectors",
    "regions",
    "applicantTypes",
    "funderLocations",
    "source",
    "eligibility",
    "applicationUrl",
    "createdAt",
    "updatedAt",
    "url_status",
    "url_checked_at",
  ].join(", ");
  const offset = (page - 1) * pageSize;
  const fetchEnd = offset + pageSize * GRANT_FETCH_OVERAGE - 1;
  const nowIso = new Date().toISOString();
  let grantsQuery = supabase
    .from("Grant")
    .select(grantColumns, { count: "exact" });

  if (hideExpired) {
    grantsQuery = grantsQuery.or(`deadline.is.null,deadline.gte.${nowIso}`);
  }
  if (hideBroken) {
    grantsQuery = grantsQuery.not("url_status", "in", "(dead,expired)");
  }
  if (funderFilter) {
    grantsQuery = grantsQuery.eq("funder", funderFilter);
  }
  if (regionFilter === "saved") {
    grantsQuery = savedGrantIds.length > 0
      ? grantsQuery.in("id", savedGrantIds)
      : grantsQuery.eq("id", "__no_saved_grants__");
  }

  if (sortMode === "deadline") {
    grantsQuery = grantsQuery.order("deadline", { ascending: true, nullsFirst: false });
  } else {
    grantsQuery = grantsQuery.order("createdAt", { ascending: false });
  }

  const { data: grantsData, count: totalGrantCount } = await grantsQuery.range(offset, fetchEnd);
  const candidateGrants = (Array.isArray(grantsData) ? grantsData : []) as unknown as GrantListRow[];
  const grants = candidateGrants
    .filter(isGrantLinkUsable)
    .filter((grant) => !appliedGrantIds.has(grant.id))
    .filter((grant) => {
      if (regionFilter === "recommended") {
        return grantMatchesFunderLocations(grant.funderLocations ?? [], userFunderLocations);
      }
      if (regionFilter && regionFilter !== "saved") {
        return grantMatchesFunderLocations(grant.funderLocations ?? [], [regionFilter]);
      }
      return true;
    })
    .slice(0, pageSize);

  const latestCreatedAt = latestDate([
    (latestCreatedResult.data as { createdAt?: string; created_at?: string } | null)?.createdAt ??
      (latestCreatedResult.data as { created_at?: string } | null)?.created_at ??
      null,
  ]);
  const latestRefreshAt = latestDate([
    (latestUpdatedResult.data as { updatedAt?: string; updated_at?: string; createdAt?: string; created_at?: string } | null)?.updatedAt ??
      (latestUpdatedResult.data as { updated_at?: string; createdAt?: string; created_at?: string } | null)?.updated_at ??
      (latestUpdatedResult.data as { createdAt?: string; created_at?: string } | null)?.createdAt ??
      (latestUpdatedResult.data as { created_at?: string } | null)?.created_at ??
      null,
  ]);
  const newTodayCount = newTodayResult.count ?? 0;
  const newThisWeekCount = newThisWeekResult.count ?? 0;
  const totalItems = totalGrantCount ?? grants.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const funderOptions = Array.from(
    new Set((funderOptionsResult.data ?? []).map((row: { funder?: string | null }) => row.funder).filter((value): value is string => Boolean(value)))
  );

  const cachedScores: Record<string, { score: number; summary?: string; scoringSource?: string }> = {};
  if (profileComplete && profile && grants.length > 0) {
    const pageGrantIds = grants.map((grant) => grant.id);
    const { data: rowsData } = await supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, scoring_source")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id)
      .in("grant_id", pageGrantIds);
    const { data: outcomeRows } = await supabase
      .from("ApplicationOutcome")
      .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
      .eq("organisationId", orgId)
      .eq("profileId", profile.id)
      .order("reportedAt", { ascending: false })
      .limit(8);
    const outcomeAdvisory = deriveOutcomeLearningAdvisory(outcomeRows ?? []);
    const grantById = new Map(grants.map((grant) => [grant.id, grant]));
    const rows = Array.isArray(rowsData) ? rowsData : [];
    for (const row of rows as { grant_id: string; score: number; decision?: string | null; summary: string | null; missing_criteria?: string[] | null; improvement_plan?: { gaps?: string[]; actions?: string[]; timeline?: string } | null; scoring_source?: string | null }[]) {
      if (appliedGrantIds.has(row.grant_id)) continue;
      const scoringSource = row.scoring_source ?? (row.summary?.startsWith("Preliminary fit") ? "heuristic" : "openai");
      const baseScore = scoringSource === "heuristic" ? Math.min(row.score, 69) : row.score;
      const grant = grantById.get(row.grant_id);
      const guardGrant = grant
        ? {
            ...grant,
            applicantTypes: grant.applicantTypes ?? [],
            sectors: grant.sectors ?? [],
            regions: grant.regions ?? [],
            funderLocations: grant.funderLocations ?? [],
          }
        : null;
      const guarded = guardGrant
        ? applyOutcomeScoreAdjustment(applyEligibilityScoreGuards(
            profileForEligibilityGuards(profile as Record<string, unknown>),
            guardGrant,
            {
              decision: row.decision === "likely_eligible" || row.decision === "review" || row.decision === "unlikely" ? row.decision : "review",
              reason: row.summary ?? "",
              confidence: baseScore,
              score: baseScore,
              summary: row.summary ?? undefined,
              reasons: [],
              improvementPlan: row.improvement_plan as EligibilityResult["improvementPlan"],
              met: [],
              missing: row.missing_criteria ?? [],
              winProbability: baseScore,
              evidenceStrength: baseScore >= 80 ? "strong" : baseScore >= 55 ? "medium" : "weak",
            }
          ), outcomeAdvisory)
        : null;
      const score = guarded ? (guarded.score ?? guarded.confidence) : baseScore;
      cachedScores[row.grant_id] = {
        score,
        summary: guarded?.summary ?? row.summary ?? undefined,
        scoringSource,
      };
    }
  }

  return (
    <div className="mx-auto max-w-7xl min-w-0 px-4 py-6 sm:p-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Available Grants</h1>
          <p className="mt-1 text-muted-foreground">
            Browse grants or use GrantsCopilot matching to find the best fit for your business.
          </p>
          <div className="mt-2 space-y-1 text-xs font-medium text-muted-foreground">
            {latestCreatedAt && (
              <p>
                Latest new grant added {new Date(latestCreatedAt).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
            {latestRefreshAt && (
              <p>
                Source refresh last touched records {new Date(latestRefreshAt).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
            <p>{newTodayCount} new today - {newThisWeekCount} new in the last 7 days</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/grants/apply-by-link"
            className="shrink-0 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Have a grant link? Apply here
          </Link>
        </div>
      </div>

      <GrantsListClient
        grants={grants.map((g) => {
          const urgency = computeUrgency(g.deadline ?? null);
          const raw = g as { createdAt?: string; created_at?: string; url_status?: string; url_checked_at?: string };
          const createdAt = raw.createdAt ?? raw.created_at ?? null;
          return {
            id: g.id,
            name: g.name,
            funder: g.funder,
            amount: g.amount ?? null,
            deadline: g.deadline ?? null,
            sectors: g.sectors ?? [],
            regions: g.regions ?? [],
            applicantTypes: g.applicantTypes ?? [],
            funderLocations: g.funderLocations ?? [],
            source: g.source ?? null,
            eligibility: g.eligibility ?? "",
            applicationUrl: g.applicationUrl ?? "",
            urgencyLevel: urgency.level,
            urgencyLabel: urgency.label,
            createdAt,
            urlStatus: raw.url_status ?? null,
            urlCheckedAt: raw.url_checked_at ?? null,
            verificationWarning: getGrantVerificationWarning(g)?.message ?? null,
          };
        })}
        userFunderLocations={userFunderLocations}
        hasProfile={hasProfile}
        profileComplete={profileComplete}
        cachedScores={cachedScores}
        savedGrantIds={savedGrantIds}
        grantUserStates={grantUserStates}
        funderOptions={funderOptions}
        serverPagination={{
          page,
          pageSize,
          totalItems,
          totalPages,
          sortMode,
          regionFilter,
          funderFilter,
          hideExpired,
          hideBroken,
        }}
      />
    </div>
  );
}
