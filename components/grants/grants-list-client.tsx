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
}

interface GrantsListClientProps {
  grants: GrantData[];
  hasProfile: boolean;
  profileComplete: boolean;
}

export function GrantsListClient({
  grants,
  hasProfile,
  profileComplete,
}: GrantsListClientProps) {
  const [matches, setMatches] = useState<Map<string, GrantMatch>>(new Map());
  const [sorted, setSorted] = useState(false);

  function handleMatches(matchResults: GrantMatch[]) {
    const map = new Map<string, GrantMatch>();
    for (const m of matchResults) {
      map.set(m.grantId, m);
    }
    setMatches(map);
    setSorted(true);
  }

  const displayGrants = sorted
    ? [...grants].sort((a, b) => {
        const scoreA = matches.get(a.id)?.score ?? 0;
        const scoreB = matches.get(b.id)?.score ?? 0;
        return scoreB - scoreA;
      })
    : grants;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {grants.length} grants available
          {sorted && " (sorted by match score)"}
        </p>
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
              matchScore={match?.score}
              matchReason={match?.reason}
            />
          );
        })}
      </div>
    </div>
  );
}
