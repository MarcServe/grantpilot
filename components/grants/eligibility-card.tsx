"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Scale, Target, Lightbulb, Check, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";

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
  met?: string[];
  missing?: string[];
  confidenceBand?: "high" | "medium" | "low";
  winProbability?: number;
  evidenceStrength?: "strong" | "medium" | "weak";
  scoringSource?: "openai" | "heuristic" | "embedding" | "intelligence" | "manual";
  outcomeWarnings?: string[];
  outcomeStrengths?: string[];
}

function cleanOutcomeWarning(value: string): string {
  const warning = value
    .replace(/^Outcome feedback advisory:\s*/i, "")
    .replace(/^Before applying:\s*/i, "")
    .replace(/This warning does not reduce the eligibility score\.?/gi, "")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s+/g, " ")
    .trim();

  if (/prior funder feedback/i.test(warning)) {
    return "Review previous funder feedback before submitting this application.";
  }

  if (/revenue|employee|registration age|company age/i.test(warning)) {
    return "Confirm whether this funder asks for revenue, employee-count, or company-age evidence.";
  }

  if (/early-stage|startup stage|business maturity|startup/i.test(warning)) {
    return "Check whether this funder is suitable for early-stage businesses or expects more trading history.";
  }

  if (/eligibility pre-screening|eligibility criteria|qualification checks/i.test(warning)) {
    return "Review the funder's eligibility criteria before starting the application.";
  }

  if (/^advise\s+/i.test(warning)) {
    return warning.replace(/^advise\s+/i, "Consider whether ").replace(/\.$/, "") + ".";
  }

  if (/^provide guidance/i.test(warning)) {
    return "Review the application guidance before starting the submission.";
  }

  return warning;
}

function OutcomeFeedbackNotice({ warnings }: { warnings?: string[] }) {
  const checks = [...new Set((warnings ?? []).map(cleanOutcomeWarning).filter(Boolean))].slice(0, 4);
  if (checks.length === 0) return null;

  return (
    <details className="group rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 marker:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-amber-900 dark:text-amber-100">
              Checks before applying
            </span>
            <span className="block truncate text-xs text-amber-800/80 dark:text-amber-200/80">
              Advisory notes from outcome feedback. These do not change this score.
            </span>
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-amber-800 group-open:hidden dark:text-amber-200">
          View
        </span>
        <span className="hidden shrink-0 text-xs font-medium text-amber-800 group-open:inline dark:text-amber-200">
          Hide
        </span>
      </summary>
      <ul className="space-y-1 border-t border-amber-200 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:text-amber-100">
        {checks.map((warning, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-700 dark:bg-amber-300" />
            <span>{warning}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function AutoImproveButton({ grantId, applicationId }: { grantId: string; applicationId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<{ missionStatement?: string; description?: string; fundingDetails?: string } | null>(null);

  async function handleOpen(open: boolean) {
    setOpen(open);
    if (open && !suggestions) {
      setLoading(true);
      try {
        const res = await fetch(`/api/grants/${grantId}/auto-improve`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to get suggestions");
        setSuggestions(data.suggestions ?? {});
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleApply(toProfile: boolean) {
    if (!suggestions || Object.keys(suggestions).length === 0) return;
    setApplying(true);
    try {
      const body = toProfile
        ? suggestions
        : { ...suggestions, applyToApplicationOnly: true, applicationId };
      const res = await fetch(`/api/grants/${grantId}/auto-improve/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to apply");
      if (toProfile) {
        toast.success("Profile updated. Re-check eligibility to see the new score.");
      } else {
        toast.success("Saved for this grant only. Your main profile is unchanged.");
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setApplying(false);
    }
  }

  const hasSuggestions = suggestions && Object.keys(suggestions).length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Auto-improve application
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Auto-improve application</DialogTitle>
          <DialogDescription>
            We&apos;ve suggested grant-specific rewrites. Save them for this grant only so your main company DNA stays unchanged.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">Generating suggestions…</p>
        ) : hasSuggestions ? (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {suggestions.missionStatement && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Mission statement</p>
                <p className="text-sm rounded border bg-muted/30 p-2">{suggestions.missionStatement}</p>
              </div>
            )}
            {suggestions.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm rounded border bg-muted/30 p-2 whitespace-pre-wrap">{suggestions.description}</p>
              </div>
            )}
            {suggestions.fundingDetails && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Funding details</p>
                <p className="text-sm rounded border bg-muted/30 p-2 whitespace-pre-wrap">{suggestions.fundingDetails}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No specific suggestions right now. Try improving your profile manually and re-check eligibility.</p>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setOpen(false)} className="sm:mr-auto">Cancel</Button>
          {hasSuggestions && (
            <>
              <Button onClick={() => handleApply(false)} disabled={applying}>
                {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save for this grant only
              </Button>
              <Button variant="outline" onClick={() => handleApply(true)} disabled={applying}>
                Apply to main profile
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EligibilityCard({
  grantId,
  applicationId,
  grantAutoImproveEnabled = true,
  initialResult = null,
}: {
  grantId: string;
  applicationId?: string;
  grantAutoImproveEnabled?: boolean;
  initialResult?: EligibilityResult | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(initialResult);
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
        if (res.status === 402) {
          toast.error(data.error ?? "Limit reached", {
            description: "Upgrade or wait until next month for more full eligibility checks.",
            action: {
              label: "Billing",
              onClick: () => router.push("/billing"),
            },
          });
          setError(null);
          return;
        }
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Scale className="h-4 w-4" />
          Eligibility confidence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!result ? (
          <>
            <p className="text-sm text-muted-foreground">
              Get a GrantsCopilot assessment of rule eligibility, strategic fit, application readiness, and practical suitability. We may show a cached score if we&apos;ve already assessed it.
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
                Eligibility confidence: {score}%
              </span>
              <Badge variant={result.scoringSource === "heuristic" ? "outline" : "secondary"}>
                {result.scoringSource === "heuristic" ? "Preliminary fit" : "Company-DNA AI scored"}
              </Badge>
              {result.winProbability != null && (
                <Badge variant="secondary">
                  Practical suitability: {Math.round(result.winProbability)}%
                </Badge>
              )}
              {result.evidenceStrength && (
                <Badge variant="outline" className="capitalize">
                  Evidence: {result.evidenceStrength}
                </Badge>
              )}
              {result.confidenceBand && (
                <Badge variant="outline" className="capitalize">
                  Confidence: {result.confidenceBand}
                </Badge>
              )}
              <Badge
                variant={result.decision === "likely_eligible" ? "default" : "secondary"}
                className={result.decision === "unlikely" ? "border-red-200 bg-red-50 text-red-700" : result.decision === "review" ? "border-amber-200 bg-amber-50 text-amber-700" : ""}
              >
                {result.decision.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed">{result.summary ?? result.reason}</p>
            {(result.met?.length || result.missing?.length) ? (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {result.scoringSource === "heuristic"
                    ? "Preliminary signals only"
                    : `Why your Business DNA gives this grant ${score}% eligibility confidence`}
                </p>
                {result.met && result.met.length > 0 && (
                  <ul className="space-y-1 text-sm text-green-700 dark:text-green-400">
                    {result.met.map((m, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0" />
                        {m}
                      </li>
                    ))}
                  </ul>
                )}
                {result.missing && result.missing.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-400">
                    {result.missing.map((m, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {m}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            {result.reasons && result.reasons.length > 0 && (
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {result.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            <OutcomeFeedbackNotice warnings={result.outcomeWarnings} />
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
                  Funding Readiness Roadmap
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
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleCheck(true)} disabled={loading}>
                {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                {result.scoringSource === "heuristic" ? "Run full company-DNA check" : "Re-check eligibility"}
              </Button>
              {grantAutoImproveEnabled && score < 85 && (result.improvementPlan?.actions?.length || result.missing?.length) ? (
                <AutoImproveButton grantId={grantId} applicationId={applicationId} />
              ) : null}
            </div>
            {!grantAutoImproveEnabled && score < 85 ? (
              <p className="pt-1 text-xs text-muted-foreground">
                Grant-specific auto-improve is available on Growth, Pro, and Business.
              </p>
            ) : null}
          </>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
