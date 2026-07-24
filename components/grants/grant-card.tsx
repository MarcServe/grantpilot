"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Building2, MapPin, ArrowRight, Users, Bookmark, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UrlStatusBadge } from "./url-status-badge";
import { grantFinderLabel } from "@/lib/grant-source-policy";
import { cn } from "@/lib/utils";
import type { GrantFitPreview, GrantFitTag, GrantFitTagKind } from "@/lib/grant-fit-preview";

interface GrantCardProps {
  id: string;
  name: string;
  funder: string;
  amount: number | null;
  deadline: string | null;
  sectors: string[];
  regions: string[];
  applicantTypes?: string[];
  matchScore?: number;
  matchReason?: string;
  urgencyLevel?: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  urgencyLabel?: string;
  /** When the grant was added to the database (ISO string). */
  addedAt?: string | null;
  isSaved?: boolean;
  userState?: GrantUserState | null;
  onToggleSave?: () => void;
  urlStatus?: string | null;
  urlCheckedAt?: string | null;
  verificationWarning?: string | null;
  source?: string | null;
  scoringSource?: string | null;
  showUnscoredState?: boolean;
  targetSummary?: string | null;
  tagExplanations?: GrantFitTag[];
  whyNotSuggested?: string[];
  matchSection?: GrantFitPreview["matchSection"];
}

type GrantUserState = "saved" | "viewed" | "deferred" | "applied" | "dismissed";

const URGENCY_CLASS: Record<string, string> = {
  HIGH: "border-red-500/50 bg-red-50 text-red-800 dark:bg-red-950/30",
  MEDIUM: "border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-950/30",
  LOW: "border-muted text-muted-foreground",
};

const TAG_STATE_CLASS: Record<string, string> = {
  met: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
  possible: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
  blocked: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200",
  neutral: "border-border bg-background text-foreground hover:bg-muted",
};

function stateLabel(status?: GrantUserState | null, isSaved?: boolean): string | null {
  if (status === "saved" || (!status && isSaved)) return "Saved";
  if (status === "deferred") return "Deferred";
  if (status === "applied") return "In Applications";
  if (status === "dismissed") return "Dismissed";
  return null;
}

function findTag(tags: GrantFitTag[] | undefined, kind: GrantFitTagKind, label: string): GrantFitTag | null {
  return tags?.find((tag) => tag.kind === kind && tag.label.toLowerCase() === label.toLowerCase()) ?? null;
}

function FitTagBadge({
  tag,
  children,
}: {
  tag: GrantFitTag;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            TAG_STATE_CLASS[tag.state]
          )}
          aria-label={`${tag.label}: ${tag.explanation}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left leading-relaxed">
        {tag.explanation}
      </TooltipContent>
    </Tooltip>
  );
}

function PlainTagBadge({
  children,
  className,
  variant = "outline",
}: {
  children: ReactNode;
  className?: string;
  variant?: "outline" | "secondary";
}) {
  return (
    <Badge variant={variant} className={cn("text-xs", className)}>
      {children}
    </Badge>
  );
}

export function GrantCard({
  id,
  name,
  funder,
  amount,
  deadline,
  sectors,
  regions,
  applicantTypes,
  matchScore,
  matchReason,
  urgencyLevel,
  urgencyLabel,
  addedAt,
  isSaved,
  userState,
  onToggleSave,
  urlStatus,
  urlCheckedAt,
  verificationWarning,
  source,
  scoringSource,
  showUnscoredState,
  targetSummary,
  tagExplanations,
  whyNotSuggested,
}: GrantCardProps) {
  const scoreLabel = scoringSource === "heuristic" ? "Prelim" : "Match";
  const sourceLabel = grantFinderLabel(source);
  const state = stateLabel(userState, isSaved);
  return (
    <TooltipProvider>
    <Card className="min-w-0 transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex min-w-0 flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <CardTitle className="min-w-0 break-words text-lg leading-snug">{name}</CardTitle>
              {urlStatus && urlStatus !== "unknown" && (
                <UrlStatusBadge status={urlStatus} checkedAt={urlCheckedAt} compact />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1 break-words">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                {funder}
              </span>
              {addedAt && (
                <span className="text-xs">
                  Added {new Date(addedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 self-start">
            {onToggleSave && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => { e.preventDefault(); onToggleSave(); }}
                title={isSaved ? "Remove from saved" : "Save to my list"}
              >
                <Bookmark
                  className={`h-4 w-4 ${isSaved ? "fill-primary text-primary" : ""}`}
                />
              </Button>
            )}
            {matchScore !== undefined && (
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ${
                matchScore >= 70
                  ? "bg-accent"
                  : matchScore >= 40
                    ? "bg-secondary"
                    : "bg-muted-foreground"
              }`}
            >
              <span className="text-center leading-none">
                {matchScore}%
                <span className="mt-0.5 block text-[9px] font-semibold">{scoreLabel}</span>
              </span>
            </div>
          )}
          </div>
        </div>
        {state && (
          <Badge variant="secondary" className="mt-2 w-fit text-xs">
            {state}
          </Badge>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sourceLabel && (
            <Badge variant={source === "openai" ? "default" : "outline"} className="w-fit text-xs">
              {sourceLabel}
            </Badge>
          )}
          {scoringSource === "heuristic" && (
            <Badge variant="outline" className="w-fit border-amber-200 bg-amber-50 text-xs text-amber-700">
              Needs full AI review
            </Badge>
          )}
          {showUnscoredState && matchScore === undefined && (
            <Badge
              variant="outline"
              className="w-fit border-blue-200 bg-blue-50 text-xs text-blue-700"
              title="GrantsCopilot is still checking this grant against your Business DNA. It will move into My Matches if the AI score shows a useful fit."
            >
              Not scored for this profile yet
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {amount && (
            <Badge variant="secondary">
              Up to {amount.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })}
            </Badge>
          )}
          {deadline && (
            <Badge variant="outline" className="gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(deadline).toLocaleDateString("en-GB")}
            </Badge>
          )}
          {urgencyLevel && urgencyLevel !== "NONE" && urgencyLabel && (
            <Badge variant="outline" className={URGENCY_CLASS[urgencyLevel] ?? ""}>
              {urgencyLabel}
            </Badge>
          )}
        </div>

        {matchReason && (
          <p className="text-sm text-muted-foreground">{matchReason}</p>
        )}

        {targetSummary && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <p className="text-xs font-semibold text-foreground">What this grant is targeting</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{targetSummary}</p>
          </div>
        )}

        {verificationWarning && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{verificationWarning}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {sectors.slice(0, 3).map((s, i) => (
            findTag(tagExplanations, "sector", s) ? (
              <FitTagBadge key={`sector-${i}-${s}`} tag={findTag(tagExplanations, "sector", s)!}>
                {s}
              </FitTagBadge>
            ) : (
              <PlainTagBadge key={`sector-${i}-${s}`}>{s}</PlainTagBadge>
            )
          ))}
          {regions.slice(0, 2).map((r, i) => (
            findTag(tagExplanations, "region", r) ? (
              <FitTagBadge key={`region-${i}-${r}`} tag={findTag(tagExplanations, "region", r)!}>
                <MapPin className="h-2.5 w-2.5" />
                {r}
              </FitTagBadge>
            ) : (
              <PlainTagBadge key={`region-${i}-${r}`} className="gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {r}
              </PlainTagBadge>
            )
          ))}
        </div>

        {applicantTypes && applicantTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {applicantTypes.slice(0, 3).map((t, i) => (
              findTag(tagExplanations, "applicant", t) ? (
                <FitTagBadge key={`applicant-${i}-${t}`} tag={findTag(tagExplanations, "applicant", t)!}>
                  <Users className="h-2.5 w-2.5" />
                  {t}
                </FitTagBadge>
              ) : (
                <PlainTagBadge key={`applicant-${i}-${t}`} variant="secondary" className="gap-1">
                  <Users className="h-2.5 w-2.5" />
                  {t}
                </PlainTagBadge>
              )
            ))}
          </div>
        )}

        {whyNotSuggested && whyNotSuggested.length > 0 && (
          <div className="rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
            <p className="font-semibold">Why not in My Matches?</p>
            <ul className="mt-1 space-y-1">
              {whyNotSuggested.slice(0, 4).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        <Link href={`/grants/${id}?from=grants`}>
          <Button variant="outline" size="sm" className="mt-2 w-full gap-2">
            View Details <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
