"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { GrantCard } from "./grant-card";
import { toast } from "sonner";
import { grantMatchesFunderLocations } from "@/lib/constants";

const PAGE_SIZE_OPTIONS = [15, 30, 50, 100, 200, 500, 1000] as const;
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
  source?: string | null;
}

interface CachedScore {
  score: number;
  summary?: string;
  scoringSource?: string;
}

interface GrantsListClientProps {
  grants: GrantData[];
  userFunderLocations: string[];
  hasProfile: boolean;
  profileComplete: boolean;
  cachedScores?: Record<string, CachedScore>;
  savedGrantIds?: string[];
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
  savedGrantIds = [],
}: GrantsListClientProps) {
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set(savedGrantIds));
  const [sortMode, setSortMode] = useState<(typeof SORT_OPTIONS)[number]["value"]>("newest");
  const [funderFilter, setFunderFilter] = useState<string>("");
  const [regionFilter, setRegionFilter] = useState<string>(() =>
    hasProfile && userFunderLocations.length > 0 ? "recommended" : ""
  );
  const [hideExpired, setHideExpired] = useState(true);
  const [hideBroken, setHideBroken] = useState(false);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

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
      toast.success("Saved to my list");
    }
  }, []);

  const funders = useMemo(
    () => Array.from(new Set(grants.map((g) => g.funder).filter(Boolean))).sort(),
    [grants]
  );

  const filteredGrants = useMemo(() => {
    const now = new Date();
    let result = grants;

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
  }, [grants, regionFilter, funderFilter, cachedScores, userFunderLocations, hideExpired, hideBroken, savedSet, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredGrants.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const displayGrants = filteredGrants.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  return (
    <div className="min-w-0">
      <div className="mb-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <p className="text-sm text-muted-foreground">
          {filteredGrants.length} grant{filteredGrants.length !== 1 ? "s" : ""}
          {totalPages > 1 && ` \u00b7 Page ${safePage} of ${totalPages}`}
        </p>
        <select
          id="grants-sort"
          name="sortMode"
          value={sortMode}
          onChange={(e) => { setSortMode(e.target.value as typeof sortMode); setCurrentPage(1); }}
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
          onChange={(e) => { setRegionFilter(e.target.value); setCurrentPage(1); }}
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
            onChange={(e) => { setFunderFilter(e.target.value); setCurrentPage(1); }}
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
          onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
          className="min-w-0 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          aria-label="Grants per page"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} per page</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm" htmlFor="grants-hide-expired">
          <input
            id="grants-hide-expired"
            name="hideExpired"
            type="checkbox"
            checked={hideExpired}
            onChange={(e) => { setHideExpired(e.target.checked); setCurrentPage(1); }}
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
            onChange={(e) => { setHideBroken(e.target.checked); setCurrentPage(1); }}
            className="rounded border-input"
          />
          Hide broken links
        </label>
      </div>

      {!hasProfile && (
        <div className="mb-6 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Create a business profile to enable AI grant matching.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {displayGrants.map((grant) => {
          const cached = cachedScores[grant.id];
          const isSaved = savedSet.has(grant.id);
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
              onToggleSave={profileComplete ? () => toggleSaved(grant.id, isSaved) : undefined}
              urlStatus={grant.urlStatus}
              urlCheckedAt={grant.urlCheckedAt}
              source={grant.source}
              scoringSource={cached?.scoringSource}
            />
          );
        })}
      </div>

      {totalPages > 1 && (
        <nav className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage(1)}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                onClick={() => setCurrentPage(p as number)}
              >
                {p}
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(totalPages)}
          >
            Last
          </Button>
        </nav>
      )}
    </div>
  );
}
