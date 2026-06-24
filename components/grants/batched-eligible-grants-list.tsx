"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Search, Sparkles, Target, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EligibleGrantCard, hasVerifiedApplicationStart, type EligibleGrant } from "./eligible-grant-card";

type ScoreTier = "suggested" | "within_reach" | "other";
type TierStatus = "idle" | "loading" | "loaded" | "error";

type TierState = {
  grants: EligibleGrant[];
  page: number;
  status: TierStatus;
  hasMore: boolean;
  availableCandidateCount: number | null;
  error: string | null;
};

type MatchesResponse = {
  grants: EligibleGrant[];
  page: number;
  hasMore: boolean;
  availableCandidateCount?: number;
  rawCandidateCount?: number;
  error?: string;
};

const TIER_ORDER: ScoreTier[] = ["suggested", "within_reach", "other"];
const TIER_META: Record<ScoreTier, {
  title: string;
  subtitle: string;
  badgeLabel: string;
  emptyLabel: string;
  icon: ReactNode;
  muted?: boolean;
}> = {
  suggested: {
    title: "Suggested for you",
    subtitle: "High eligibility - grouped by direct forms and grant pages.",
    badgeLabel: "Suggested",
    emptyLabel: "No current suggested grants.",
    icon: <Sparkles className="h-4 w-4 text-primary" />,
  },
  within_reach: {
    title: "Within reach",
    subtitle: "Partial fit - review the gaps before applying.",
    badgeLabel: "Within reach",
    emptyLabel: "No within-reach grants in this batch.",
    icon: <Target className="h-4 w-4 text-amber-600" />,
  },
  other: {
    title: "Other scored grants",
    subtitle: "Lower fit - may still be worth reviewing later.",
    badgeLabel: "Other",
    emptyLabel: "No lower-fit grants in this batch.",
    icon: null,
    muted: true,
  },
};

function initialTierState(): TierState {
  return {
    grants: [],
    page: 0,
    status: "idle",
    hasMore: false,
    availableCandidateCount: null,
    error: null,
  };
}

function emptySections(): Record<ScoreTier, TierState> {
  return {
    suggested: initialTierState(),
    within_reach: initialTierState(),
    other: initialTierState(),
  };
}

function uniqueGrants(existing: EligibleGrant[], next: EligibleGrant[]): EligibleGrant[] {
  const seen = new Set(existing.map((grant) => grant.grantId));
  const merged = [...existing];
  for (const grant of next) {
    if (seen.has(grant.grantId)) continue;
    seen.add(grant.grantId);
    merged.push(grant);
  }
  return merged;
}

function matchesQuery(grant: EligibleGrant, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return grant.grantName.toLowerCase().includes(q) || grant.funder.toLowerCase().includes(q);
}

async function fetchTier(tier: ScoreTier, page: number, pageSize: number): Promise<MatchesResponse> {
  const params = new URLSearchParams({
    tier,
    page: String(page),
    pageSize: String(pageSize),
  });
  const response = await fetch(`/api/grants/eligible-matches?${params.toString()}`, {
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Unable to load matches");
  }
  return body as MatchesResponse;
}

export function BatchedEligibleGrantsList({
  initialTier,
  initialPage,
  pageSize,
}: {
  initialTier: ScoreTier | null;
  initialPage: number;
  pageSize: number;
}) {
  const [activeTier, setActiveTier] = useState<ScoreTier | null>(initialTier);
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<Record<ScoreTier, TierState>>(() => emptySections());
  const tiersToShow = useMemo(() => activeTier ? [activeTier] : TIER_ORDER, [activeTier]);

  const loadTier = useCallback(
    async (tier: ScoreTier, page: number, mode: "replace" | "append") => {
      setSections((current) => ({
        ...current,
        [tier]: {
          ...current[tier],
          status: "loading",
          error: null,
        },
      }));

      try {
        const result = await fetchTier(tier, page, pageSize);
        setSections((current) => ({
          ...current,
          [tier]: {
            grants: mode === "append" ? uniqueGrants(current[tier].grants, result.grants) : result.grants,
            page: result.page,
            status: "loaded",
            hasMore: result.hasMore,
            availableCandidateCount: result.availableCandidateCount ?? result.rawCandidateCount ?? result.grants.length,
            error: null,
          },
        }));
      } catch (error) {
        setSections((current) => ({
          ...current,
          [tier]: {
            ...current[tier],
            status: "error",
            error: error instanceof Error ? error.message : "Unable to load matches",
          },
        }));
      }
    },
    [pageSize]
  );

  useEffect(() => {
    let cancelled = false;
    const loadSequence = async () => {
      setSections(emptySections());
      const sequence = activeTier ? [activeTier] : TIER_ORDER;
      for (const tier of sequence) {
        if (cancelled) return;
        await loadTier(tier, activeTier ? initialPage : 1, "replace");
      }
    };
    void loadSequence();
    return () => {
      cancelled = true;
    };
  }, [activeTier, initialPage, loadTier]);

  const visibleLoadedGrants = useMemo(
    () => tiersToShow.flatMap((tier) => sections[tier].grants).filter((grant) => matchesQuery(grant, query)),
    [query, sections, tiersToShow]
  );
  const hasLoadedAny = TIER_ORDER.some((tier) => sections[tier].grants.length > 0);
  const isAnyLoading = TIER_ORDER.some((tier) => sections[tier].status === "loading");
  const allVisibleDone = tiersToShow.every((tier) => sections[tier].status === "loaded" || sections[tier].status === "error");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setActiveTier(null)} className="focus-visible:outline-none">
          <Badge
            variant={activeTier === null ? "default" : "outline"}
            className={`cursor-pointer gap-1 transition-all hover:opacity-80 ${activeTier === null ? "ring-2 ring-primary ring-offset-1" : ""}`}
          >
            All batches
          </Badge>
        </button>
        {TIER_ORDER.map((tier) => (
          <button key={tier} type="button" onClick={() => setActiveTier(tier)} className="focus-visible:outline-none">
            <Badge
              variant={activeTier === tier ? "default" : "outline"}
              className={`cursor-pointer gap-1 transition-all hover:opacity-80 ${activeTier === tier ? "ring-2 ring-primary ring-offset-1" : ""}`}
            >
              {TIER_META[tier].icon}
              {TIER_META[tier].badgeLabel}
              {sections[tier].availableCandidateCount != null && (
                <span className="ml-0.5 text-[10px] opacity-80">{sections[tier].availableCandidateCount}</span>
              )}
            </Badge>
          </button>
        ))}

        <div className="relative ml-auto w-full sm:w-60">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search loaded grants..."
            className="h-8 pl-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {query.trim() && (
        <p className="text-sm text-muted-foreground">
          {visibleLoadedGrants.length} matching loaded {visibleLoadedGrants.length === 1 ? "grant" : "grants"}.
        </p>
      )}

      {tiersToShow.map((tier) => (
        <MatchTierSection
          key={tier}
          tier={tier}
          state={sections[tier]}
          query={query}
          onLoadMore={() => loadTier(tier, sections[tier].page + 1, "append")}
        />
      ))}

      {!hasLoadedAny && allVisibleDone && !isAnyLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No current matches available</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Grants were scored, but the current results are expired, already applied, outside your funder region, or otherwise unavailable.
            </p>
            <Link href="/grants" className="mt-4">
              <Button size="sm">Browse All Grants</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MatchTierSection({
  tier,
  state,
  query,
  onLoadMore,
}: {
  tier: ScoreTier;
  state: TierState;
  query: string;
  onLoadMore: () => void;
}) {
  const meta = TIER_META[tier];
  const grants = state.grants.filter((grant) => matchesQuery(grant, query));

  if (state.status === "idle" || (state.status === "loading" && state.grants.length === 0)) {
    return <MatchSectionSkeleton title={meta.title} />;
  }

  if (state.status === "error") {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex items-start gap-3 py-5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Could not load {meta.title.toLowerCase()}.</p>
            <p className="mt-1">{state.error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.grants.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-base ${meta.muted ? "text-muted-foreground" : ""}`}>
            {meta.icon}
            {meta.title}
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">{meta.subtitle}</p>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{meta.emptyLabel}</CardContent>
      </Card>
    );
  }

  const directFormGrants = tier === "suggested"
    ? grants.filter((grant) => hasVerifiedApplicationStart(grant.applicationUrlQuality))
    : [];
  const grantPageGrants = tier === "suggested"
    ? grants.filter((grant) => !hasVerifiedApplicationStart(grant.applicationUrlQuality))
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 text-base ${meta.muted ? "text-muted-foreground" : ""}`}>
          {meta.icon}
          {meta.title}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({state.availableCandidateCount ?? state.grants.length})
          </span>
        </CardTitle>
        <p className="text-sm font-normal text-muted-foreground">{meta.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {grants.length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            No loaded grants match your search in this batch.
          </div>
        ) : tier === "suggested" ? (
          <div className="space-y-5">
            {directFormGrants.length > 0 && (
              <GrantLinkGroup
                title="Direct grant form links"
                description="These have a verified direct application form or official application portal."
                grants={directFormGrants}
              />
            )}
            {grantPageGrants.length > 0 && (
              <GrantLinkGroup
                title="Grant page links"
                description="These are strong matches, but the direct form has not been verified yet."
                grants={grantPageGrants}
              />
            )}
          </div>
        ) : (
          grants.map((grant) => <EligibleGrantCard key={grant.grantId} grant={grant} />)
        )}
        {(state.hasMore || state.status === "loading") && (
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLoadMore}
              disabled={state.status === "loading"}
              className="gap-2"
            >
              {state.status === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Load more {meta.badgeLabel.toLowerCase()}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GrantLinkGroup({
  title,
  description,
  grants,
}: {
  title: string;
  description: string;
  grants: EligibleGrant[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {title} <span className="text-xs font-normal text-muted-foreground">({grants.length})</span>
        </h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-3">
        {grants.map((grant) => <EligibleGrantCard key={grant.grantId} grant={grant} />)}
      </div>
    </div>
  );
}

function MatchSectionSkeleton({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                {item === 0 && <div className="h-4 w-full animate-pulse rounded bg-muted" />}
              </div>
              <div className="h-7 w-20 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
