"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, AlertTriangle, CheckCircle2, FileText, LinkIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { GrantEffortSignal } from "@/lib/grant-effort";
import { formatGrantFundingValue, type GrantFundingValue } from "@/lib/grant-value";
import type { ConfidenceState, ScoreDimensions } from "@/lib/grant-decision-signals";
import { isGrantAggregatorClassificationReason } from "@/lib/grant-application-url-quality";

type GrantUserState = "saved" | "viewed" | "deferred" | "applied" | "dismissed";

export interface EligibleGrant {
  grantId: string;
  grantName: string;
  funder: string;
  amount?: number | null;
  fundingValue?: GrantFundingValue | null;
  fundingValueType?: string | null;
  fundingValueEvidence?: string | null;
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
  applicationUrl?: string | null;
  detailUrl?: string | null;
  directApplicationUrl?: string | null;
  applicationUrlQuality?: string | null;
  applicationUrlKind?: string | null;
  applicationUrlQualityReason?: string | null;
  scoringSource?: string | null;
  userState?: GrantUserState | null;
  effort?: GrantEffortSignal | null;
  scoreDimensions?: ScoreDimensions | null;
  confidenceState?: ConfidenceState | null;
  recommendationCategory?: string | null;
  primaryBlocker?: string | null;
  nextAction?: string | null;
  profileFactsNeeded?: string[] | null;
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
  if (status === "viewed") return "Viewed";
  if (status === "deferred") return "Deferred";
  if (status === "applied") return "In Applications";
  if (status === "dismissed") return "Dismissed";
  return null;
}

export function hasVerifiedApplicationStart(quality?: string | null): boolean {
  return quality === "verified_direct" || quality === "verified_portal";
}

function applicationLinkLabel(quality?: string | null, reason?: string | null): string {
  if (isGrantAggregatorClassificationReason(reason)) return "Funding directory link";
  if (hasVerifiedApplicationStart(quality)) return "Direct grant form link";
  if (quality === "rejected") return "Needs official funder link";
  return "Grant page link";
}

function stateToast(status: GrantUserState): string {
  if (status === "saved") return "Saved. This grant stays available in your active matches.";
  if (status === "viewed") return "Marked as reviewed. It will move out of active Suggested.";
  if (status === "deferred") return "Deferred for later. It will no longer clog active Suggested or proactive reminders.";
  if (status === "applied") return "Added to Applications. It will no longer appear in active Suggested.";
  return "Dismissed. It will no longer appear in active matches.";
}

export function EligibleGrantCard({
  grant,
  onStateChanged,
}: {
  grant: EligibleGrant;
  onStateChanged?: (grant: EligibleGrant, status: GrantUserState) => void;
}) {
  const detailHref = `/grants/${grant.grantId}?from=matches`;
  const deadlineStr = formatDeadline(grant.deadline);
  const addedAt = formatAddedAt(grant.addedAt);
  const [currentState, setCurrentState] = useState<GrantUserState | null>(grant.userState ?? null);
  const [loadingState, setLoadingState] = useState<GrantUserState | null>(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const state = stateLabel(currentState);
  const isDeadlineSoon =
    grant.deadline && new Date(grant.deadline).getTime() - pageLoadedAt < ONE_WEEK_MS;
  const verifiedApplicationStart = hasVerifiedApplicationStart(grant.applicationUrlQuality);
  const isAggregatorDirectoryLink = isGrantAggregatorClassificationReason(grant.applicationUrlQualityReason);
  const canOpenReviewLink = !isAggregatorDirectoryLink && grant.applicationUrlQuality !== "rejected";
  const linkLabel = applicationLinkLabel(grant.applicationUrlQuality, grant.applicationUrlQualityReason);
  const externalActionHref = verifiedApplicationStart
    ? grant.directApplicationUrl ?? grant.applicationUrl ?? grant.detailUrl ?? null
    : canOpenReviewLink
      ? grant.detailUrl ?? grant.applicationUrl ?? grant.directApplicationUrl ?? null
      : null;

  const actions: string[] = [];
  if (grant.improvementPlan?.actions?.length) actions.push(...grant.improvementPlan.actions);
  if (grant.improvementPlan?.gaps?.length) actions.push(...grant.improvementPlan.gaps);
  if (grant.missingCriteria?.length) actions.push(...grant.missingCriteria);
  const uniqueActions = [...new Set(actions)].slice(0, 3);

  useEffect(() => {
    setCurrentState(grant.userState ?? null);
  }, [grant.userState]);

  async function markGrantState(status: GrantUserState) {
    if (loadingState || status === currentState) return;
    setLoadingState(status);
    try {
      const response = await fetch("/api/grants/user-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId: grant.grantId, status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Could not update grant status");
      }
      setCurrentState(status);
      toast.success(stateToast(status));
      onStateChanged?.({ ...grant, userState: status }, status);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update grant status");
    } finally {
      setLoadingState(null);
    }
  }

  async function submitFeedback(category: string) {
    if (feedbackSubmitting) return;
    setFeedbackSubmitting(category);
    try {
      const response = await fetch("/api/grants/recommendation-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantId: grant.grantId,
          category,
          source: "eligible_match_card",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Could not save feedback");
      }
      setFeedbackSent(category);
      toast.success("Feedback saved for review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save feedback");
    } finally {
      setFeedbackSubmitting(null);
    }
  }

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
          {grant.score}% {grant.scoringSource === "heuristic" ? "prelim" : "eligibility"}
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
            : isAggregatorDirectoryLink || grant.applicationUrlQuality === "rejected"
              ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-slate-50 text-slate-700"
        }`}
      >
        {verifiedApplicationStart ? <CheckCircle2 className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
        {linkLabel}
      </Badge>

      {grant.effort && (
        <div className="grid gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-950 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <span className="block font-semibold">Value</span>
            <span className="text-blue-900/80">{formatGrantFundingValue(grant.fundingValue ?? grant.amount ?? grant.effort.amount)}</span>
            {grant.fundingValue?.label && (
              <span className="block text-[10px] text-blue-900/60">{grant.fundingValue.label}</span>
            )}
          </div>
          <div>
            <span className="block font-semibold">Time</span>
            <span className="text-blue-900/80">{grant.effort.estimatedTimeLabel} · {grant.effort.effortBand}</span>
          </div>
          <div>
            <span className="block font-semibold">ROAT</span>
            <span className="text-blue-900/80">{grant.effort.roatLabel}</span>
          </div>
          <div>
            <span className="block font-semibold">Priority</span>
            <span className="text-blue-900/80">{grant.effort.priorityLabel}</span>
          </div>
          <div>
            <span className="block font-semibold">Readiness</span>
            <span className="text-blue-900/80">
              {grant.scoreDimensions?.applicationReadiness ?? grant.effort.achievabilityScore}% · {grant.effort.applicationPathway}
            </span>
          </div>
        </div>
      )}

      {(grant.recommendationCategory ?? grant.effort?.recommendationCategory) && (
        <Badge variant="outline" className="w-fit border-emerald-200 bg-emerald-50 text-emerald-700">
          {grant.recommendationCategory ?? grant.effort?.recommendationCategory}
        </Badge>
      )}

      {(grant.primaryBlocker || grant.nextAction) && (
        <div className="rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-blue-950">
          {grant.primaryBlocker && (
            <p>
              <span className="font-semibold">Primary blocker: </span>
              <span className="text-blue-900/80">{grant.primaryBlocker}</span>
            </p>
          )}
          {grant.nextAction && (
            <p className={grant.primaryBlocker ? "mt-1" : ""}>
              <span className="font-semibold">Next action: </span>
              <span className="text-blue-900/80">{grant.nextAction}</span>
            </p>
          )}
        </div>
      )}

      {grant.summary && (
        <p className="text-sm text-muted-foreground line-clamp-2">{grant.summary}</p>
      )}

      {uniqueActions.length > 0 && grant.score < 70 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>To improve: {uniqueActions.join("; ")}</span>
        </div>
      )}

      {grant.effort?.whatToCheck?.length ? (
        <div className="rounded-md border border-blue-100 bg-white px-3 py-2 text-xs text-blue-950">
          <span className="font-semibold">Check before applying: </span>
          <span className="text-blue-900/80">{grant.effort.whatToCheck.join(" ")}</span>
        </div>
      ) : null}

      {grant.verificationWarning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{grant.verificationWarning}</span>
        </div>
      )}

      {!verifiedApplicationStart && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            isAggregatorDirectoryLink || grant.applicationUrlQuality === "rejected"
              ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
              : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300"
          }`}
        >
          <LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {isAggregatorDirectoryLink
              ? "This link opens another grant directory or funding finder, not the official funder page. Save the funder page or direct application form before applying."
              : grant.applicationUrlQuality === "rejected"
                ? "This link is not specific enough to use as an application route. Save the official funder page or direct form first."
                : "This is a grant information page, not a verified direct form yet. Review the page to find the funder application route."}
          </span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <Select
            value={currentState ?? "active"}
            onValueChange={(value) => {
              if (value === "active") return;
              void markGrantState(value as GrantUserState);
            }}
            disabled={loadingState != null}
          >
            <SelectTrigger className="h-8 w-[172px] text-xs">
              <SelectValue placeholder="Set status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active" disabled>
                Set status
              </SelectItem>
              <SelectItem value="saved">Save / keep active</SelectItem>
              <SelectItem value="viewed">Reviewed / seen before</SelectItem>
              <SelectItem value="deferred">Defer for later</SelectItem>
              <SelectItem value="applied">Add to Applications</SelectItem>
              <SelectItem value="dismissed">Dismiss</SelectItem>
            </SelectContent>
          </Select>
          {loadingState && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={detailHref}>
            <FileText className="h-3.5 w-3.5" />
            View details
          </Link>
        </Button>
        {externalActionHref && (
          <Button asChild size="sm" className="gap-1.5">
            <a href={externalActionHref} target="_blank" rel="noopener noreferrer">
              {verifiedApplicationStart ? "Apply" : "Review grant page"}
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-3">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Feedback</span>
        {[
          ["relevant", "Relevant"],
          ["not_relevant", "Not relevant"],
          ["expired", "Expired"],
          ["wrong_location", "Wrong location"],
          ["not_my_business_type", "Wrong type"],
          ["already_applied", "Already applied"],
        ].map(([category, label]) => (
          <Button
            key={category}
            type="button"
            variant={feedbackSent === category ? "secondary" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={feedbackSubmitting != null}
            onClick={() => submitFeedback(category)}
          >
            {feedbackSubmitting === category && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
