"use client";

import { useState, useMemo, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GrantCard } from "./grant-card";
import { toast } from "sonner";
import { grantMatchesFunderLocations } from "@/lib/constants";
import type { GrantFitPreview } from "@/lib/grant-fit-preview";

const PAGE_SIZE_OPTIONS = [20, 30, 50] as const;
const DEFAULT_PAGE_SIZE = 30;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "recommended", label: "Recommended for you" },
  { value: "deadline", label: "Deadline soonest" },
] as const;

const REGION_OPTIONS = [
  { value: "", label: "All regions" },
  { value: "UK", label: "UK" },
  { value: "US", label: "US" },
  { value: "EU", label: "EU" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "Global", label: "Global" },
  { value: "recommended", label: "Recommended for you" },
  { value: "saved", label: "My saved grants" },
] as const;

interface GrantData {
  id: string;
  name: string;
  funder: string;
  amount: number | null;
  deadline: string | null;
  sectors: string[];
  regions: string[];
  applicantTypes?: string[];
  funderLocations: string[];
  eligibility: string;
  applicationUrl: string;
  urgencyLevel?: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  urgencyLabel?: string;
  createdAt?: string | null;
  urlStatus?: string | null;
  urlCheckedAt?: string | null;
  verificationWarning?: string | null;
  source?: string | null;
}

interface CachedScore {
  score: number;
  summary?: string;
  scoringSource?: string;
}

type GrantUserState = "saved" | "viewed" | "deferred" | "applied" | "dismissed";

interface GrantsListClientProps {
  grants: GrantData[];
  userFunderLocations: string[];
  hasProfile: boolean;
  profileComplete: boolean;
  cachedScores?: Record<string, CachedScore>;
  fitPreviews?: Record<string, GrantFitPreview>;
  savedGrantIds?: string[];
  grantUserStates?: Record<string, GrantUserState>;
  funderOptions?: string[];
  serverPagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    sortMode: (typeof SORT_OPTIONS)[number]["value"];
    shelf?: "active" | "expired";
    regionFilter: string;
    funderFilter: string;
    hideExpired: boolean;
    hideBroken: boolean;
  };
}

function matchesFunderLocations(
  grantFL: string[],
  userFL: string[]
): boolean {
  return grantMatchesFunderLocations(grantFL, userFL);
}

function timeValue(value?: string | null): number {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

function deadlineValue(value?: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function generatePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

export function GrantsListClient({
  grants,
  userFunderLocations,
  hasProfile,
  profileComplete,
  cachedScores = {},
  fitPreviews = {},
  savedGrantIds = [],
  grantUserStates = {},
  funderOptions,
  serverPagination,
}: GrantsListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentPathname = pathname ?? "/grants";
  const searchParams = useSearchParams();
  const isServerPaged = Boolean(serverPagination);
  const shelf = serverPagination?.shelf ?? "active";
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set(savedGrantIds));
  const [stateMap, setStateMap] = useState<Record<string, GrantUserState>>(() => ({ ...grantUserStates }));
  const [sortMode, setSortMode] = useState<(typeof SORT_OPTIONS)[number]["value"]>(serverPagination?.sortMode ?? "newest");
  const [funderFilter, setFunderFilter] = useState<string>(serverPagination?.funderFilter ?? "");
  const [regionFilter, setRegionFilter] = useState<string>(() =>
    serverPagination?.regionFilter ?? (hasProfile && userFunderLocations.length > 0 ? "recommended" : "")
  );
  const [hideExpired, setHideExpired] = useState(serverPagination?.hideExpired ?? true);
  const [hideBroken, setHideBroken] = useState(serverPagination?.hideBroken ?? false);
  const [pageSize, setPageSize] = useState(serverPagination?.pageSize ?? DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(serverPagination?.page ?? 1);

  const updateServerParams = useCallback((updates: Record<string, string | number | boolean | null>) => {
    if (!serverPagination) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === false) params.delete(key);
      else params.set(key, String(value));
    }
    if (shelf === "expired") params.set("shelf", "expired");
    if (!("page" in updates)) params.set("page", "1");
    router.push(`${currentPathname}?${params.toString()}`);
  }, [currentPathname, router, searchParams, serverPagination, shelf]);

  const toggleSaved = useCallback(async (grantId: string, currentlySaved: boolean) => {
    if (currentlySaved) {
      const res = await fetch(`/api/grants/saved?grantId=${encodeURIComponent(grantId)}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to remove from saved");
        return;
      }
      setSavedSet((prev) => {
        const next = new Set(prev);
        next.delete(grantId);
        return next;
      });
      setStateMap((prev) => {
        const next = { ...prev };
        delete next[grantId];
        return next;
      });
      toast.success("Removed from saved grants");
    } else {
      const res = await fetch("/api/grants/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantIds: [grantId] }),
      });
      if (!res.ok) {
        toast.error("Failed to save grant");
        return;
      }
      setSavedSet((prev) => new Set(prev).add(grantId));
      setStateMap((prev) => ({ ...prev, [grantId]: "saved" }));
      toast.success("Saved to my list");
    }
  }, []);

  const funders = useMemo(() => {
    const source = funderOptions?.length ? funderOptions : grants.map((g) => g.funder);
    return Array.from(new Set(source.filter(Boolean))).sort();
  }, [funderOptions, grants]);

  const filteredGrants = useMemo(() => {
    const now = new Date();
    let result = grants;

    if (isServerPaged) {
      return result;
    }

    if (hideExpired) {
      result = result.filter((g) => {
        if (!g.deadline) return true;
        return new Date(g.deadline) >= now;
      });
    }

    if (hideBroken) {
      result = result.filter((g) => g.urlStatus !== "dead" && g.urlStatus !== "expired");
    }

    if (regionFilter === "recommended") {
      result = result.filter((g) =>
        matchesFunderLocations(g.funderLocations, userFunderLocations)
      );
    } else if (regionFilter === "saved") {
      result = result.filter((g) => savedSet.has(g.id));
    } else if (regionFilter) {
      result = result.filter(
        (g) => grantMatchesFunderLocations(g.funderLocations, [regionFilter])
      );
    }

    if (funderFilter) {
      result = result.filter((g) => g.funder === funderFilter);
    }

    result = [...result].sort((a, b) => {
      const scoreA = cachedScores[a.id]?.score ?? 0;
      const scoreB = cachedScores[b.id]?.score ?? 0;
      const newestDiff = timeValue(b.createdAt) - timeValue(a.createdAt);

      if (sortMode === "recommended") {
        return scoreB - scoreA || newestDiff;
      }

      if (sortMode === "deadline") {
        return deadlineValue(a.deadline) - deadlineValue(b.deadline) || newestDiff;
      }

      return newestDiff || scoreB - scoreA;
    });

    return result;
  }, [grants, regionFilter, funderFilter, cachedScores, userFunderLocations, hideExpired, hideBroken, savedSet, sortMode, isServerPaged]);

  const totalPages = serverPagination?.totalPages ?? Math.max(1, Math.ceil(filteredGrants.length / pageSize));
  const safePage = serverPagination?.page ?? Math.min(currentPage, totalPages);
  const visibleCount = serverPagination?.totalItems ?? filteredGrants.length;
  const displayGrants = isServerPaged
    ? filteredGrants
    : filteredGrants.slice(
        (safePage - 1) * pageSize,
        safePage * pageSize
      );

  const goToPage = (page: number) => {
    if (isServerPaged) updateServerParams({ page });
    else setCurrentPage(page);
  };

  return (
    <div className="min-w-0">
      <div className="mb-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <p className="text-sm text-muted-foreground">
          {visibleCount} {shelf === "expired" ? "archived " : ""}grant{visibleCount !== 1 ? "s" : ""}
          {totalPages > 1 && ` \u00b7 Page ${safePage} of ${totalPages}`}
        </p>
        <select
          id="grants-sort"
          name="sortMode"
          value={sortMode}
          onChange={(e) => {
            const value = e.target.value as typeof sortMode;
            setSortMode(value);
            setCurrentPage(1);
            if (isServerPaged) updateServerParams({ sort: value, page: 1 });
          }}
          className="min-w-0 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          aria-label="Sort grants"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          id="grants-region-filter"
          name="regionFilter"
          value={regionFilter}
          onChange={(e) => {
            setRegionFilter(e.target.value);
            setCurrentPage(1);
            if (isServerPaged) updateServerParams({ region: e.target.value, page: 1 });
          }}
          className="min-w-0 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          aria-label="Filter by region"
        >
          {REGION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {funders.length > 0 && (
          <select
            id="grants-funder-filter"
            name="funderFilter"
            value={funderFilter}
            onChange={(e) => {
              setFunderFilter(e.target.value);
              setCurrentPage(1);
              if (isServerPaged) updateServerParams({ funder: e.target.value, page: 1 });
            }}
            className="min-w-0 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            aria-label="Filter by funder"
          >
            <option value="">All funders</option>
            {funders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
        <select
          id="grants-page-size"
          name="pageSize"
          value={pageSize}
          onChange={(e) => {
            const value = Number(e.target.value);
            setPageSize(value);
            setCurrentPage(1);
            if (isServerPaged) updateServerParams({ pageSize: value, page: 1 });
          }}
          className="min-w-0 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          aria-label="Grants per page"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} per page</option>
          ))}
        </select>
        {shelf === "active" && (
          <>
            <label className="flex items-center gap-1.5 text-sm" htmlFor="grants-hide-expired">
              <input
                id="grants-hide-expired"
                name="hideExpired"
                type="checkbox"
                checked={hideExpired}
                onChange={(e) => {
                  setHideExpired(e.target.checked);
                  setCurrentPage(1);
                  if (isServerPaged) updateServerParams({ hideExpired: e.target.checked ? "1" : "0", page: 1 });
                }}
                className="rounded border-input"
              />
              Hide expired
            </label>
            <label className="flex items-center gap-1.5 text-sm" htmlFor="grants-hide-broken">
              <input
                id="grants-hide-broken"
                name="hideBroken"
                type="checkbox"
                checked={hideBroken}
                onChange={(e) => {
                  setHideBroken(e.target.checked);
                  setCurrentPage(1);
                  if (isServerPaged) updateServerParams({ hideBroken: e.target.checked ? "1" : null, page: 1 });
                }}
                className="rounded border-input"
              />
              Hide broken links
            </label>
          </>
        )}
      </div>

      {shelf === "expired" && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Expired and unavailable grants are kept here for auditability. They are not mixed into current matches,
          daily alerts, or proactive WhatsApp/email notifications.
        </div>
      )}

      {!hasProfile && (
        <div className="mb-6 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Create a business profile to enable AI grant matching.
        </div>
      )}

      {displayGrants.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background p-8 text-center">
          <p className="font-semibold">
            {shelf === "expired" ? "No expired grants found" : "No current grants found"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {shelf === "expired"
              ? "Expired opportunities will appear here after their deadline passes or their source link is marked unavailable."
              : "Try changing the region, funder, or saved-grants filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {displayGrants.map((grant) => {
          const cached = cachedScores[grant.id];
          const fitPreview = fitPreviews[grant.id];
          const isSaved = savedSet.has(grant.id);
          const userState = stateMap[grant.id] ?? null;
          return (
            <GrantCard
              key={grant.id}
              id={grant.id}
              name={grant.name}
              funder={grant.funder}
              amount={grant.amount}
              deadline={grant.deadline}
              sectors={grant.sectors}
              regions={grant.regions}
              applicantTypes={grant.applicantTypes}
              matchScore={cached?.score}
              matchReason={cached?.summary}
              urgencyLevel={grant.urgencyLevel}
              urgencyLabel={grant.urgencyLabel}
              addedAt={grant.createdAt ?? undefined}
              isSaved={isSaved}
              userState={userState}
              onToggleSave={profileComplete ? () => toggleSaved(grant.id, isSaved) : undefined}
              urlStatus={grant.urlStatus}
              urlCheckedAt={grant.urlCheckedAt}
              verificationWarning={grant.verificationWarning}
              source={grant.source}
              scoringSource={cached?.scoringSource}
              showUnscoredState={profileComplete && (!cached || fitPreview?.matchSection === "unscored")}
              targetSummary={fitPreview?.targetSummary ?? null}
              tagExplanations={fitPreview?.tagExplanations ?? []}
              whyNotSuggested={profileComplete ? fitPreview?.whyNotSuggested ?? [] : []}
              matchSection={fitPreview?.matchSection}
            />
          );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => goToPage(1)}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => goToPage(Math.max(1, safePage - 1))}
          >
            Previous
          </Button>

          {generatePageNumbers(safePage, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
                ...
              </span>
            ) : (
              <Button
                key={p}
                variant={p === safePage ? "default" : "outline"}
                size="sm"
                className="min-w-[2.25rem]"
                onClick={() => goToPage(p as number)}
              >
                {p}
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => goToPage(Math.min(totalPages, safePage + 1))}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => goToPage(totalPages)}
          >
            Last
          </Button>
        </nav>
      )}
    </div>
  );
}
