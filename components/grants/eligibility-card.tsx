"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Scale, CheckCircle, AlertCircle, XCircle, Target, Lightbulb } from "lucide-react";

interface ImprovementPlan {
  gaps?: string[];
  actions?: string[];
  timeline?: string;
}

interface EligibilityResult {
  decision: "likely_eligible" | "review" | "unlikely";
  reason: string;
  confidence: number;
  score?: number;
  summary?: string;
  reasons?: string[];
  alignment?: string[];
  improvementPlan?: ImprovementPlan;
}

export function EligibilityCard({ grantId }: { grantId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck(skipCache = false) {
    setLoading(true);
    setError(null);
    if (!result) setResult(null);
    try {
      const url = skipCache ? `/api/grants/${grantId}/eligibility?skipCache=true` : `/api/grants/${grantId}/eligibility`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to check eligibility");
        return;
      }
      setResult(data);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const score = result?.score ?? result?.confidence ?? 0;
  const decisionConfig = {
    likely_eligible: { label: "Likely eligible", icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
    review: { label: "Review", icon: AlertCircle, color: "text-amber-600 bg-amber-50 border-amber-200" },
    unlikely: { label: "Unlikely", icon: XCircle, color: "text-red-600 bg-red-50 border-red-200" },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Scale className="h-4 w-4" />
          Eligibility decision
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!result ? (
          <>
            <p className="text-sm text-muted-foreground">
              Get an AI assessment of how well your business fits this grant. We may show a cached score if we&apos;ve already assessed it.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCheck(false)}
              disabled={loading}
              className="gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Check eligibility
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">
                You&apos;re {score}% eligible
              </span>
              <Badge
                variant={result.decision === "likely_eligible" ? "default" : "secondary"}
                className={result.decision === "unlikely" ? "border-red-200 bg-red-50 text-red-700" : result.decision === "review" ? "border-amber-200 bg-amber-50 text-amber-700" : ""}
              >
                {result.decision.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed">{result.summary ?? result.reason}</p>
            {result.reasons && result.reasons.length > 0 && (
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {result.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            {result.alignment && result.alignment.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Target className="h-3.5 w-3.5" />
                  How this grant aligns with you
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                  {result.alignment.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.improvementPlan && (result.improvementPlan.gaps?.length || result.improvementPlan.actions?.length) && (
              <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                  <Lightbulb className="h-3.5 w-3.5" />
                  How to improve your fit
                </p>
                {result.improvementPlan.gaps && result.improvementPlan.gaps.length > 0 && (
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Gaps</p>
                )}
                <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                  {(result.improvementPlan.gaps ?? []).map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
                {result.improvementPlan.actions && result.improvementPlan.actions.length > 0 && (
                  <>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">Actions</p>
                    <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                      {result.improvementPlan.actions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </>
                )}
                {result.improvementPlan.timeline && (
                  <p className="mt-2 text-xs text-muted-foreground">Timeline: {result.improvementPlan.timeline}</p>
                )}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => handleCheck(true)} disabled={loading}>
              {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Re-check (fresh AI)
            </Button>
          </>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
