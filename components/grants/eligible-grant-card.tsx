"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertTriangle, CheckCircle2, FileText, LinkIcon } from "lucide-react";

type GrantUserState = "saved" | "viewed" | "deferred" | "applied" | "dismissed";

export interface EligibleGrant {
  grantId: string;
  grantName: string;
  funder: string;
  deadline: string | null;
  addedAt?: string | null;
  scoredAt?: string | null;
  score: number;
  decision: string | null;
  summary: string | null;
  missingCriteria: string[] | null;
  improvementPlan: { gaps?: string[]; actions?: string[] } | null;
  outcomeWarnings?: string[];
  verificationWarning?: string | null;
  applicationUrlQuality?: string | null;
  applicationUrlKind?: string | null;
  applicationUrlQualityReason?: string | null;
  scoringSource?: string | null;
  userState?: GrantUserState | null;
}

const ONE_WEEK_MS = 7 * 86_400_000;
const pageLoadedAt = Date.now();

function scoreBadgeVariant(score: number): "default" | "secondary" | "outline" {
  if (score >= 85) return "default";
  if (score >= 50) return "secondary";
  return "outline";
}

function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  try {
    return new Date(deadline).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function formatAddedAt(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function stateLabel(status?: GrantUserState | null): string | null {
  if (status === "saved") return "Saved";
  if (status === "deferred") return "Deferred";
  if (status === "applied") return "In Applications";
  if (status === "dismissed") return "Dismissed";
  return null;
}

export function hasVerifiedApplicationStart(quality?: string | null): boolean {
  return quality === "verified_direct" || quality === "verified_portal";
}

function applicationLinkLabel(quality?: string | null): string {
  if (hasVerifiedApplicationStart(quality)) return "Direct grant form link";
  return "Grant page link";
}

export function EligibleGrantCard({ grant }: { grant: EligibleGrant }) {
  const detailHref = `/grants/${grant.grantId}?from=matches`;
  const deadlineStr = formatDeadline(grant.deadline);
  const addedAt = formatAddedAt(grant.addedAt);
  const state = stateLabel(grant.userState);
  const isDeadlineSoon =
    grant.deadline && new Date(grant.deadline).getTime() - pageLoadedAt < ONE_WEEK_MS;
  const verifiedApplicationStart = hasVerifiedApplicationStart(grant.applicationUrlQuality);
  const linkLabel = applicationLinkLabel(grant.applicationUrlQuality);

  const actions: string[] = [];
  if (grant.improvementPlan?.actions?.length) actions.push(...grant.improvementPlan.actions);
  if (grant.improvementPlan?.gaps?.length) actions.push(...grant.improvementPlan.gaps);
  if (grant.missingCriteria?.length) actions.push(...grant.missingCriteria);
  const uniqueActions = [...new Set(actions)].slice(0, 3);

  return (
    <div className="min-w-0 rounded-lg border p-4 transition-colors hover:bg-muted/50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            href={detailHref}
            className="break-words font-medium text-foreground hover:underline"
          >
            {grant.grantName}
          </Link>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">
            {grant.funder}
            {addedAt && (
              <>
                {" · "}
                <span>Added {addedAt}</span>
              </>
            )}
            {deadlineStr && (
              <>
                {" · "}
                <span className={isDeadlineSoon ? "font-medium text-amber-600" : ""}>
                  Deadline: {deadlineStr}
                </span>
              </>
            )}
          </p>
        </div>
        <Badge variant={scoreBadgeVariant(grant.score)} className="shrink-0">
          {grant.score}% {grant.scoringSource === "heuristic" ? "prelim" : "match"}
        </Badge>
      </div>

      {grant.scoringSource === "heuristic" && (
        <Badge variant="outline" className="w-fit border-amber-200 bg-amber-50 text-amber-700">
          Needs full company-DNA AI review
        </Badge>
      )}

      {state && (
        <Badge variant="outline" className="w-fit border-blue-200 bg-blue-50 text-blue-700">
          {state}
        </Badge>
      )}

      <Badge
        variant="outline"
        className={`w-fit gap-1.5 ${
          verifiedApplicationStart
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-50 text-slate-700"
        }`}
      >
        {verifiedApplicationStart ? <CheckCircle2 className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
        {linkLabel}
      </Badge>

      {grant.summary && (
        <p className="text-sm text-muted-foreground line-clamp-2">{grant.summary}</p>
      )}

      {uniqueActions.length > 0 && grant.score < 70 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>To improve: {uniqueActions.join("; ")}</span>
        </div>
      )}

      {grant.verificationWarning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{grant.verificationWarning}</span>
        </div>
      )}

      {!verifiedApplicationStart && (
        <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300">
          <LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This is a grant information page, not a verified direct form yet. Review the page to find the funder application route.
          </span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 pt-1">
        <Link href={detailHref}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            View details
          </Button>
        </Link>
        <Link href={detailHref}>
          <Button size="sm" className="gap-1.5">
            {verifiedApplicationStart ? "Apply" : "Review grant page"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
