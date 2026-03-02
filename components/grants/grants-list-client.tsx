"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { GrantCard } from "./grant-card";
import { MatchButton } from "./match-button";
import type { GrantMatch } from "@/lib/claude";

const PAGE_SIZE = 30;

const REGION_OPTIONS = [
  { value: "", label: "All regions" },
  { value: "UK", label: "UK" },
  { value: "US", label: "US" },
  { value: "EU", label: "EU" },
  { value: "Global", label: "Global" },
  { value: "recommended", label: "Recommended for you" },
] as const;

interface GrantData {
  id: string;
  name: string;
  funder: string;
  amount: number | null;
  deadline: string | null;
  sectors: string[];
  regions: string[];
  funderLocations: string[];
  eligibility: string;
  applicationUrl: string;
  urgencyLevel?: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  urgencyLabel?: string;
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
}

function matchesFunderLocations(
  grantFL: string[],
  userFL: string[]
): boolean {
  if (userFL.length === 0) return true;
  if (grantFL.length === 0) return true;
  return grantFL.some((r) => userFL.includes(r));
}

export function GrantsListClient({
  grants,
  userFunderLocations,
  hasProfile,
  profileComplete,
  cachedScores = {},
}: GrantsListClientProps) {
  const [matches, setMatches] = useState<Map<string, GrantMatch>>(new Map());
  const [sorted, setSorted] = useState(false);
  const [funderFilter, setFunderFilter] = useState<string>("");
  const [regionFilter, setRegionFilter] = useState<string>(
    userFunderLocations.length > 0 ? "recommended" : ""
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
    let result = grants;

    if (regionFilter === "recommended") {
      result = result.filter((g) =>
        matchesFunderLocations(g.funderLocations, userFunderLocations)
      );
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
  }, [grants, regionFilter, funderFilter, sorted, matches, cachedScores, userFunderLocations]);

  const displayGrants = filteredGrants.slice(0, visibleCount);
  const hasMore = visibleCount < filteredGrants.length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {displayGrants.length} of {filteredGrants.length} grants
          {sorted && " (sorted by match score)"}
        </p>
        <select
          value={regionFilter}
          onChange={(e) => { setRegionFilter(e.target.value); setVisibleCount(PAGE_SIZE); }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          {REGION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {funders.length > 0 && (
          <select
            value={funderFilter}
            onChange={(e) => { setFunderFilter(e.target.value); setVisibleCount(PAGE_SIZE); }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All funders</option>
            {funders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
        {hasProfile && (
          <MatchButton
            onMatches={handleMatches}
            disabled={!profileComplete}
          />
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
              matchScore={match?.score ?? cached?.score}
              matchReason={match?.reason ?? cached?.summary}
              urgencyLevel={grant.urgencyLevel}
              urgencyLabel={grant.urgencyLabel}
            />
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Load more ({filteredGrants.length - visibleCount} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
