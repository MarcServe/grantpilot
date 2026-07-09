"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, BrainCircuit, Eye, Loader2, Search, Sparkles, Target, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EligibleGrantCard, hasVerifiedApplicationStart, type EligibleGrant } from "./eligible-grant-card";

type MatchSection = "suggested" | "within_reach" | "other" | "needs_review" | "reviewed";
type TierStatus = "idle" | "loading" | "loaded" | "error";
type GrantUserState = "saved" | "viewed" | "deferred" | "applied" | "dismissed";

type TierState = {
  grants: EligibleGrant[];
  page: number;
  status: TierStatus;
  hasMore: boolean;
  availableCandidateCount: number | null;
  availableCandidateCountIsEstimate: boolean;
  error: string | null;
};

type MatchesResponse = {
  grants: EligibleGrant[];
  page: number;
  hasMore: boolean;
  availableCandidateCount?: number;
  availableCandidateCountIsEstimate?: boolean;
  rawCandidateCount?: number;
  error?: string;
};

const TIER_ORDER: MatchSection[] = ["suggested", "within_reach", "other", "needs_review", "reviewed"];
const TIER_META: Record<MatchSection, {
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
    subtitle: "Partial fit - newer current grants appear first, then older near-matches.",
    badgeLabel: "Within reach",
    emptyLabel: "No within-reach grants in this batch.",
    icon: <Target className="h-4 w-4 text-amber-600" />,
  },
  other: {
    title: "Other scored grants",
    subtitle: "Lower fit - newest trusted AI-scored grants first.",
    badgeLabel: "Other",
    emptyLabel: "No lower-fit grants in this batch.",
    icon: null,
    muted: true,
  },
  needs_review: {
    title: "Needs full AI review",
    subtitle: "Preliminary heuristic matches kept separate until the full company-DNA score runs.",
    badgeLabel: "Needs AI review",
    emptyLabel: "No preliminary grants waiting for full AI review.",
    icon: <BrainCircuit className="h-4 w-4 text-amber-600" />,
  },
  reviewed: {
    title: "Reviewed / seen before",
    subtitle: "Viewed grants remain available here without counting as active Suggested matches.",
    badgeLabel: "Reviewed",
    emptyLabel: "No viewed grants in this batch.",
    icon: <Eye className="h-4 w-4 text-slate-600" />,
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
    availableCandidateCountIsEstimate: false,
    error: null,
  };
}

function emptySections(): Record<MatchSection, TierState> {
  return {
    suggested: initialTierState(),
    within_reach: initialTierState(),
    other: initialTierState(),
    needs_review: initialTierState(),
    reviewed: initialTierState(),
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

async function fetchTier(tier: MatchSection, page: number, pageSize: number): Promise<MatchesResponse> {
  const params = new URLSearchParams({
    tier,
    page: String(page),
    pageSize: String(pageSize),
  });

  const response = await fetch(`/api/grants/eligible-matches?${params.toString()}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Unable to load matches");
  }
  return body as MatchesResponse;
}

function formatCount(state: TierState): string | null {
  if (state.availableCandidateCount == null) return null;
  return `${state.availableCandidateCount}${state.availableCandidateCountIsEstimate ? "+" : ""}`;
}

function countAfterRemoval(state: TierState): number | null {
  if (state.availableCandidateCount == null) return null;
  return Math.max(0, state.availableCandidateCount - 1);
}

function countAfterAddition(state: TierState): number | null {
  if (state.availableCandidateCount == null) return state.grants.length + 1;
  return state.availableCandidateCount + 1;
}

export function BatchedEligibleGrantsList({
  initialTier,
  initialPage,
  pageSize,
}: {
  initialTier: MatchSection | null;
  initialPage: number;
  pageSize: number;
}) {
  const [activeTier, setActiveTier] = useState<MatchSection | null>(initialTier);
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<Record<MatchSection, TierState>>(() => emptySections());
  const inFlightRequests = useRef<Set<string>>(new Set());
  const tiersToShow = useMemo(() => activeTier ? [activeTier] : TIER_ORDER, [activeTier]);

  const loadTier = useCallback(
    async (tier: MatchSection, page: number, mode: "replace" | "append") => {
      const requestKey = `${tier}:${page}:${pageSize}:${mode}`;
      if (inFlightRequests.current.has(requestKey)) return;
      inFlightRequests.current.add(requestKey);
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
            availableCandidateCountIsEstimate: Boolean(result.availableCandidateCountIsEstimate),
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
      } finally {
        inFlightRequests.current.delete(requestKey);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const firstTier = initialTier ?? "suggested";
    const remainingTiers = TIER_ORDER.filter((tier) => tier !== firstTier);

    inFlightRequests.current.clear();
    setSections(emptySections());
    void loadTier(firstTier, initialTier ? initialPage : 1, "replace");

    remainingTiers.forEach((tier, index) => {
      const timer = setTimeout(() => {
        if (!cancelled) {
          void loadTier(tier, 1, "replace");
        }
      }, 120 + index * 140);
      timers.push(timer);
    });

    return () => {
      cancelled = true;
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [initialPage, initialTier, loadTier]);

  useEffect(() => {
    if (!activeTier) return;
    if (sections[activeTier].status !== "idle") return;
    void loadTier(activeTier, initialPage, "replace");
  }, [activeTier, initialPage, loadTier, sections]);

  const visibleLoadedGrants = useMemo(
    () => tiersToShow.flatMap((tier) => sections[tier].grants).filter((grant) => matchesQuery(grant, query)),
    [query, sections, tiersToShow]
  );
  const hasLoadedAny = TIER_ORDER.some((tier) => sections[tier].grants.length > 0);
  const isAnyLoading = TIER_ORDER.some((tier) => sections[tier].status === "loading");
  const allVisibleDone = tiersToShow.every((tier) => sections[tier].status === "loaded" || sections[tier].status === "error");

  const handleGrantStateChanged = useCallback((grant: EligibleGrant, status: GrantUserState) => {
    setSections((current) => {
      const updated: Record<MatchSection, TierState> = { ...current };
      const shouldLeaveActive = status === "viewed" || status === "deferred" || status === "applied" || status === "dismissed";

      for (const tier of TIER_ORDER) {
        const state = current[tier];
        const existing = state.grants.find((item) => item.grantId === grant.grantId);
        if (!existing) continue;

        if (!shouldLeaveActive || (status === "viewed" && tier === "reviewed")) {
          updated[tier] = {
            ...state,
            grants: state.grants.map((item) =>
              item.grantId === grant.grantId ? { ...item, userState: status } : item
            ),
          };
          continue;
        }

        updated[tier] = {
          ...state,
          grants: state.grants.filter((item) => item.grantId !== grant.grantId),
          availableCandidateCount: countAfterRemoval(state),
        };
      }

      if (status === "viewed") {
        const reviewed = updated.reviewed;
        if (!reviewed.grants.some((item) => item.grantId === grant.grantId)) {
          updated.reviewed = {
            ...reviewed,
            grants: [{ ...grant, userState: "viewed" }, ...reviewed.grants],
            availableCandidateCount: countAfterAddition(reviewed),
          };
        }
      }

      return updated;
    });
  }, []);

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
              {formatCount(sections[tier]) != null && (
                <span className="ml-0.5 text-[10px] opacity-80">{formatCount(sections[tier])}</span>
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

      {tiersToShow.map((tier, index) => {
        const state = sections[tier];
        if (!activeTier && state.status === "idle" && index > 0) {
          return <QueuedTierPlaceholder key={tier} tier={tier} />;
        }
        return (
          <MatchTierSection
            key={tier}
            tier={tier}
            state={state}
            query={query}
            onLoadMore={() => loadTier(tier, state.page + 1, "append")}
            onGrantStateChanged={handleGrantStateChanged}
          />
        );
      })}

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
  onGrantStateChanged,
}: {
  tier: MatchSection;
  state: TierState;
  query: string;
  onLoadMore: () => void;
  onGrantStateChanged: (grant: EligibleGrant, status: GrantUserState) => void;
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
            ({formatCount(state) ?? state.grants.length})
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
                onGrantStateChanged={onGrantStateChanged}
              />
            )}
            {grantPageGrants.length > 0 && (
              <GrantLinkGroup
                title="Grant page links"
                description="These are strong matches, but the direct form has not been verified yet."
                grants={grantPageGrants}
                onGrantStateChanged={onGrantStateChanged}
              />
            )}
          </div>
        ) : (
          grants.map((grant) => (
            <EligibleGrantCard
              key={grant.grantId}
              grant={grant}
              onStateChanged={onGrantStateChanged}
            />
          ))
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

function QueuedTierPlaceholder({ tier }: { tier: MatchSection }) {
  const meta = TIER_META[tier];
  return (
    <div className="rounded-lg border border-dashed bg-background/60 px-4 py-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        {meta.icon}
        <span className="font-medium text-foreground">{meta.title}</span>
        <span>loads after the earlier batches.</span>
      </div>
    </div>
  );
}

function GrantLinkGroup({
  title,
  description,
  grants,
  onGrantStateChanged,
}: {
  title: string;
  description: string;
  grants: EligibleGrant[];
  onGrantStateChanged: (grant: EligibleGrant, status: GrantUserState) => void;
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
        {grants.map((grant) => (
          <EligibleGrantCard
            key={grant.grantId}
            grant={grant}
            onStateChanged={onGrantStateChanged}
          />
        ))}
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
        {[0, 1].map((item) => (
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
