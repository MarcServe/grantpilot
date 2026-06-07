"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sparkles, Target, Search, X } from "lucide-react";
import { EligibleGrantCard, type EligibleGrant } from "./eligible-grant-card";

type ScoreTier = "suggested" | "within_reach" | "other";

function tierFor(score: number): ScoreTier {
  if (score >= 85) return "suggested";
  if (score >= 50) return "within_reach";
  return "other";
}

interface Props {
  grants: EligibleGrant[];
  counts: { suggested: number; withinReach: number; other: number };
  activeTier: ScoreTier | null;
  links: {
    all: string;
    suggested: string;
    withinReach: string;
    other: string;
  };
}

export function EligibleGrantsList({ grants, counts, activeTier, links }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return grants.filter((g) => {
      if (q && !g.grantName.toLowerCase().includes(q) && !g.funder.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [grants, query]);

  const suggested = filtered.filter((g) => tierFor(g.score) === "suggested");
  const withinReach = filtered.filter((g) => tierFor(g.score) === "within_reach");
  const other = filtered.filter((g) => tierFor(g.score) === "other");

  const isFiltered = activeTier !== null || query.trim() !== "";

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterBadge
          label={`${counts.suggested} suggested`}
          icon={<Sparkles className="h-3 w-3" />}
          variant="default"
          selected={activeTier === "suggested"}
          dimmed={activeTier !== null && activeTier !== "suggested"}
          href={activeTier === "suggested" ? links.all : links.suggested}
        />
        <FilterBadge
          label={`${counts.withinReach} within reach`}
          icon={<Target className="h-3 w-3" />}
          variant="secondary"
          selected={activeTier === "within_reach"}
          dimmed={activeTier !== null && activeTier !== "within_reach"}
          href={activeTier === "within_reach" ? links.all : links.withinReach}
        />
        <FilterBadge
          label={`${counts.other} other`}
          icon={null}
          variant="outline"
          selected={activeTier === "other"}
          dimmed={activeTier !== null && activeTier !== "other"}
          href={activeTier === "other" ? links.all : links.other}
        />

        <div className="relative ml-auto w-full sm:w-60">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search grants or funders…"
            className="h-8 pl-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {isFiltered && (
          <Link
            href={links.all}
            onClick={() => setQuery("")}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Clear filters
          </Link>
        )}
      </div>

      {/* Filtered count */}
      {isFiltered && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {grants.length} grants
          {activeTier === "suggested" && " — score 85%+"}
          {activeTier === "within_reach" && " — score 50–84%"}
          {activeTier === "other" && " — score below 50%"}
        </p>
      )}

      {/* Grant list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No grants match your current filters.
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-2 text-sm font-medium text-primary underline"
            >
              Clear search
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {suggested.length > 0 && (
            <GrantSection
              title="Suggested for you"
              subtitle="High eligibility — strong fit for your business."
              icon={<Sparkles className="h-4 w-4 text-primary" />}
              grants={suggested}
              totalInTier={counts.suggested}
            />
          )}
          {withinReach.length > 0 && (
            <GrantSection
              title="Within reach"
              subtitle="Partial fit — see what you can improve."
              icon={<Target className="h-4 w-4 text-amber-600" />}
              grants={withinReach}
              totalInTier={counts.withinReach}
            />
          )}
          {other.length > 0 && (
            <GrantSection
              title="Other scored grants"
              subtitle="Lower fit — may still be worth reviewing."
              icon={null}
              grants={other}
              totalInTier={counts.other}
              muted
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */

function FilterBadge({
  label,
  icon,
  variant,
  selected,
  dimmed,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  variant: "default" | "secondary" | "outline";
  selected: boolean;
  dimmed: boolean;
  href: string;
}) {
  const badgeVariant = dimmed ? "outline" : variant;

  return (
    <Link href={href} className="focus-visible:outline-none">
      <Badge
        variant={badgeVariant}
        className={`cursor-pointer gap-1 transition-all hover:opacity-80 ${
          selected ? "ring-2 ring-primary ring-offset-1" : ""
        } ${dimmed ? "opacity-50" : ""}`}
      >
        {icon}
        {label}
      </Badge>
    </Link>
  );
}

function GrantSection({
  title,
  subtitle,
  icon,
  grants,
  totalInTier,
  muted,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  grants: EligibleGrant[];
  totalInTier: number;
  muted?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 text-base ${muted ? "text-muted-foreground" : ""}`}>
          {icon}
          {title}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({totalInTier})
          </span>
        </CardTitle>
        <p className="text-sm font-normal text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {grants.map((g) => (
          <EligibleGrantCard key={g.grantId} grant={g} />
        ))}
      </CardContent>
    </Card>
  );
}
