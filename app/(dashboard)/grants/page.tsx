import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { GrantsListClient } from "@/components/grants/grants-list-client";
import { computeUrgency } from "@/lib/urgency";
import { getGrantVerificationWarning } from "@/lib/grant-freshness";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { getServerCache } from "@/lib/server-cache";
import {
  GRANT_FIT_PREVIEW_SELECT_BASE,
  GRANT_FIT_PREVIEW_SELECT_WITH_DECISION,
  getGrantFitPreviews,
  isGrantFitPreviewColumnError,
} from "@/lib/grant-fit-preview";

const GRANT_PAGE_SIZE_OPTIONS = [20, 30, 50] as const;
const DEFAULT_GRANT_PAGE_SIZE = 20;
const GRANT_FETCH_OVERAGE = 2;
const GRANTS_PUBLIC_CACHE_TTL_MS = 60_000;

type GrantsSearchParams = Promise<Record<string, string | string[] | undefined>>;
type GrantSortMode = "newest" | "recommended" | "deadline";
type GrantShelf = "active" | "expired";
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
  detailUrl?: string | null;
  directApplicationUrl?: string | null;
  applicationUrlQuality?: string | null;
  applicationUrlKind?: string | null;
  opportunityType?: string | null;
  fundingValueType?: string | null;
  applicantMaxAmount?: number | null;
  applicantTypicalAmount?: number | null;
  programmeTotalAmount?: number | null;
  fundingValueEvidence?: string | null;
};

function latestDate(values: (string | null)[]): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    if (!latest) return value;
    return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
  }, null);
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

function normalizeShelf(value: string | undefined): GrantShelf {
  return value === "expired" ? "expired" : "active";
}

function buildShelfHref(shelf: GrantShelf): string {
  return shelf === "expired" ? "/grants?shelf=expired" : "/grants";
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
  const shelf = normalizeShelf(firstParam(params.shelf) ?? firstParam(params.status));
  const regionFilter = firstParam(params.region) ?? "";
  const funderFilter = firstParam(params.funder) ?? "";
  const hideExpired = shelf === "active" ? firstParam(params.hideExpired) !== "0" : false;
  const hideBroken = shelf === "active" ? firstParam(params.hideBroken) === "1" : false;

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

  const grantsOverviewCacheKey = "grants-overview:v1";
  const [
    latestCreatedResult,
    latestUpdatedResult,
    newTodayResult,
    newThisWeekResult,
    funderOptionsResult,
  ] = await getServerCache(
    grantsOverviewCacheKey,
    { ttlMs: GRANTS_PUBLIC_CACHE_TTL_MS, maxEntries: 10 },
    () => Promise.all([
      supabase.from("Grant").select("createdAt").order("createdAt", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("Grant").select("updatedAt, createdAt").order("updatedAt", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("Grant").select("id", { count: "exact", head: true }).gte("createdAt", startOfToday.toISOString()),
      supabase.from("Grant").select("id", { count: "exact", head: true }).gte("createdAt", startOfWeek.toISOString()),
      supabase.from("Grant").select("funder").order("funder", { ascending: true }).limit(500),
    ])
  );

  const grantColumnsBase = `${GRANT_FIT_PREVIEW_SELECT_BASE}, source, applicationUrl, updatedAt, url_checked_at`;
  const grantColumnsWithDecision = `${GRANT_FIT_PREVIEW_SELECT_WITH_DECISION}, source, updatedAt, url_checked_at`;
  const offset = (page - 1) * pageSize;
  const fetchEnd = offset + pageSize * GRANT_FETCH_OVERAGE - 1;
  const nowIso = new Date().toISOString();
  const grantsListCacheKey = [
    "grants-list:v3",
    `shelf:${shelf}`,
    `sort:${sortMode}`,
    `region:${regionFilter || "all"}`,
    `funder:${funderFilter || "all"}`,
    `hideExpired:${hideExpired ? 1 : 0}`,
    `hideBroken:${hideBroken ? 1 : 0}`,
    `page:${page}`,
    `size:${pageSize}`,
    regionFilter === "saved" ? `saved:${savedGrantIds.slice().sort().join(",")}` : "saved:na",
  ].join(":");
  const { data: grantsData, count: totalGrantCount } = await getServerCache(
    grantsListCacheKey,
    { ttlMs: GRANTS_PUBLIC_CACHE_TTL_MS, maxEntries: 100 },
    async () => {
      const runQuery = (columns: string) => {
        let grantsQuery = supabase
          .from("Grant")
          .select(columns, { count: "exact" });

        if (shelf === "expired") {
          grantsQuery = grantsQuery.or(`deadline.lt.${nowIso},url_status.in.(dead,expired)`);
        } else if (hideExpired) {
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

        return grantsQuery.range(offset, fetchEnd);
      };
      const result = await runQuery(grantColumnsWithDecision);
      if (result.error && isGrantFitPreviewColumnError(result.error.message)) {
        return runQuery(grantColumnsBase);
      }
      return result;
    }
  );
  const candidateGrants = (Array.isArray(grantsData) ? grantsData : []) as unknown as GrantListRow[];
  const grants = candidateGrants
    .filter((grant) => shelf === "expired" ? !isGrantActionableNow(grant) : isGrantActionableNow(grant))
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

  const fitPreviews = grants.length > 0
    ? await getGrantFitPreviews({
        supabase,
        organisationId: orgId,
        profile: profileComplete ? profile as Record<string, unknown> : null,
        grants,
        userFunderLocations,
        grantUserStates,
        appliedGrantIds,
      })
    : {};
  const cachedScores = Object.fromEntries(
    Object.entries(fitPreviews)
      .filter(([, preview]) => preview.score != null)
      .map(([grantId, preview]) => [
        grantId,
        {
          score: preview.score as number,
          summary: preview.summary ?? undefined,
          scoringSource: preview.scoringSource ?? undefined,
        },
      ])
  );

  return (
    <div className="mx-auto max-w-7xl min-w-0 px-4 py-6 sm:p-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Grant Library</h1>
          <p className="mt-1 text-muted-foreground">
            {shelf === "expired"
              ? "Review expired or unavailable opportunities separately from current grants."
              : "Browse all current grants. For personalised AI-scored recommendations, use My Matches."}
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
            href="/grants/eligible"
            className="shrink-0 rounded-md border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            View My Matches
          </Link>
          <Link
            href={buildShelfHref("active")}
            className={`shrink-0 rounded-md border px-4 py-2 text-sm font-medium ${
              shelf === "active" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            Current grants
          </Link>
          <Link
            href={buildShelfHref("expired")}
            className={`shrink-0 rounded-md border px-4 py-2 text-sm font-medium ${
              shelf === "expired" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            Expired archive
          </Link>
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
        fitPreviews={fitPreviews}
        savedGrantIds={savedGrantIds}
        grantUserStates={grantUserStates}
        funderOptions={funderOptions}
        serverPagination={{
          page,
          pageSize,
          totalItems,
          totalPages,
          sortMode,
          shelf,
          regionFilter,
          funderFilter,
          hideExpired,
          hideBroken,
        }}
      />
    </div>
  );
}
