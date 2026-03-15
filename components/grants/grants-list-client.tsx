"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { GrantCard } from "./grant-card";
import { MatchButton } from "./match-button";
import { toast } from "sonner";
import type { GrantMatch } from "@/lib/claude";

const PAGE_SIZE_OPTIONS = [15, 30, 50, 100, 200, 500, 1000] as const;
const DEFAULT_PAGE_SIZE = 30;

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
}

interface CachedScore {
  score: number;
  summary?: string;
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
  if (userFL.length === 0) return true;
  if (grantFL.length === 0) return true;
  return grantFL.some((r) => userFL.includes(r));
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
  const [matches, setMatches] = useState<Map<string, GrantMatch>>(new Map());
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set(savedGrantIds));
  const [sorted, setSorted] = useState(false);
  const [funderFilter, setFunderFilter] = useState<string>("");
  const [regionFilter, setRegionFilter] = useState<string>(
    userFunderLocations.length > 0 ? "recommended" : ""
  );
  const [hideExpired, setHideExpired] = useState(true);
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

  const saveMatchedToList = useCallback(async () => {
    const grantIds = Array.from(matches.keys());
    if (grantIds.length === 0) return;
    const res = await fetch("/api/grants/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantIds }),
    });
    if (!res.ok) {
      toast.error("Failed to save matched grants");
      return;
    }
    setSavedSet((prev) => {
      const next = new Set(prev);
      grantIds.forEach((id) => next.add(id));
      return next;
    });
    toast.success(`Saved ${grantIds.length} grants to your list. Visit them anytime under My saved grants.`);
  }, [matches]);

  const funders = useMemo(
    () => Array.from(new Set(grants.map((g) => g.funder).filter(Boolean))).sort(),
    [grants]
  );

  function handleMatches(matchResults: GrantMatch[]) {
    const map = new Map<string, GrantMatch>();
    for (const m of matchResults) {
      map.set(m.grantId, m);
    }
    setMatches(map);
    setSorted(true);
  }

  const filteredGrants = useMemo(() => {
    const now = new Date();
    let result = grants;

    if (hideExpired) {
      result = result.filter((g) => {
        if (!g.deadline) return true;
        return new Date(g.deadline) >= now;
      });
    }

    if (regionFilter === "recommended") {
      result = result.filter((g) =>
        matchesFunderLocations(g.funderLocations, userFunderLocations)
      );
    } else if (regionFilter === "saved") {
      result = result.filter((g) => savedSet.has(g.id));
    } else if (regionFilter) {
      result = result.filter(
        (g) => g.funderLocations.length === 0 || g.funderLocations.includes(regionFilter)
      );
    }

    if (funderFilter) {
      result = result.filter((g) => g.funder === funderFilter);
    }

    if (sorted) {
      result = [...result].sort((a, b) => {
        const scoreA = matches.get(a.id)?.score ?? cachedScores[a.id]?.score ?? 0;
        const scoreB = matches.get(b.id)?.score ?? cachedScores[b.id]?.score ?? 0;
        return scoreB - scoreA;
      });
    }

    return result;
  }, [grants, regionFilter, funderFilter, sorted, matches, cachedScores, userFunderLocations, hideExpired]);

  const totalPages = Math.max(1, Math.ceil(filteredGrants.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const displayGrants = filteredGrants.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {filteredGrants.length} grant{filteredGrants.length !== 1 ? "s" : ""}
          {sorted && " (sorted by match score)"}
          {totalPages > 1 && ` \u00b7 Page ${safePage} of ${totalPages}`}
        </p>
        <select
          id="grants-region-filter"
          name="regionFilter"
          value={regionFilter}
          onChange={(e) => { setRegionFilter(e.target.value); setCurrentPage(1); }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
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
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
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
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
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
        {hasProfile && (
          <>
            <MatchButton
              onMatches={handleMatches}
              disabled={!profileComplete}
            />
            {matches.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={saveMatchedToList}
                className="gap-1"
              >
                Save matched to my list
              </Button>
            )}
          </>
        )}
      </div>

      {!hasProfile && (
        <div className="mb-6 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Create a business profile to enable AI grant matching.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {displayGrants.map((grant) => {
          const match = matches.get(grant.id);
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
              matchScore={match?.score ?? cached?.score}
              matchReason={match?.reason ?? cached?.summary}
              urgencyLevel={grant.urgencyLevel}
              urgencyLabel={grant.urgencyLabel}
              addedAt={grant.createdAt ?? undefined}
              isSaved={isSaved}
              onToggleSave={profileComplete ? () => toggleSaved(grant.id, isSaved) : undefined}
            />
          );
        })}
      </div>

      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2">
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
