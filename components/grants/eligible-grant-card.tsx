"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertTriangle, FileText } from "lucide-react";

export interface EligibleGrant {
  grantId: string;
  grantName: string;
  funder: string;
  deadline: string | null;
  score: number;
  decision: string | null;
  summary: string | null;
  missingCriteria: string[] | null;
  improvementPlan: { gaps?: string[]; actions?: string[] } | null;
}

function scoreBadgeVariant(score: number): "default" | "secondary" | "outline" {
  if (score >= 80) return "default";
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

export function EligibleGrantCard({ grant }: { grant: EligibleGrant }) {
  const deadlineStr = formatDeadline(grant.deadline);
  const isDeadlineSoon =
    grant.deadline && new Date(grant.deadline).getTime() - Date.now() < 7 * 86_400_000;

  const actions: string[] = [];
  if (grant.improvementPlan?.actions?.length) actions.push(...grant.improvementPlan.actions);
  if (grant.improvementPlan?.gaps?.length) actions.push(...grant.improvementPlan.gaps);
  if (grant.missingCriteria?.length) actions.push(...grant.missingCriteria);
  const uniqueActions = [...new Set(actions)].slice(0, 3);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/grants/${grant.grantId}`}
            className="font-medium text-foreground hover:underline"
          >
            {grant.grantName}
          </Link>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {grant.funder}
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
          {grant.score}% match
        </Badge>
      </div>

      {grant.summary && (
        <p className="text-sm text-muted-foreground line-clamp-2">{grant.summary}</p>
      )}

      {uniqueActions.length > 0 && grant.score < 70 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>To improve: {uniqueActions.join("; ")}</span>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Link href={`/grants/${grant.grantId}`}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            View details
          </Button>
        </Link>
        <Link href={`/grants/${grant.grantId}`}>
          <Button size="sm" className="gap-1.5">
            Apply
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
