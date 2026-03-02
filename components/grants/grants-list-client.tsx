"use client";

import { useState } from "react";
import { GrantCard } from "./grant-card";
import { MatchButton } from "./match-button";
import type { GrantMatch } from "@/lib/claude";

interface GrantData {
  id: string;
  name: string;
  funder: string;
  amount: number | null;
  deadline: string | null;
  sectors: string[];
  regions: string[];
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
  hasProfile: boolean;
  profileComplete: boolean;
  cachedScores?: Record<string, CachedScore>;
}

export function GrantsListClient({
  grants,
  hasProfile,
  profileComplete,
  cachedScores = {},
}: GrantsListClientProps) {
  const [matches, setMatches] = useState<Map<string, GrantMatch>>(new Map());
  const [sorted, setSorted] = useState(false);
  const [funderFilter, setFunderFilter] = useState<string>("");

  const funders = Array.from(new Set(grants.map((g) => g.funder).filter(Boolean))).sort();

  function handleMatches(matchResults: GrantMatch[]) {
    const map = new Map<string, GrantMatch>();
    for (const m of matchResults) {
      map.set(m.grantId, m);
    }
    setMatches(map);
    setSorted(true);
  }

  let displayGrants = funderFilter
    ? grants.filter((g) => g.funder === funderFilter)
    : grants;
  displayGrants = sorted
    ? [...displayGrants].sort((a, b) => {
        const scoreA = matches.get(a.id)?.score ?? cachedScores[a.id]?.score ?? 0;
        const scoreB = matches.get(b.id)?.score ?? cachedScores[b.id]?.score ?? 0;
        return scoreB - scoreA;
      })
    : displayGrants;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {displayGrants.length} of {grants.length} grants
          {sorted && " (sorted by match score)"}
        </p>
        {funders.length > 0 && (
          <select
            value={funderFilter}
            onChange={(e) => setFunderFilter(e.target.value)}
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
    </div>
  );
}
