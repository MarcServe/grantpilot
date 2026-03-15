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
import { Loader2, Scale, CheckCircle, AlertCircle, XCircle, Target, Lightbulb, Check, AlertTriangle, Sparkles } from "lucide-react";
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
    if (toProfile === false && !applicationId) return;
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
        toast.success("Saved for this application only. Your main profile is unchanged. The next time GrantsCopilot fills this application, it will use these details.");
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
            We&apos;ve suggested rewrites to better match this grant. Apply to your main profile (used for all grants) or use for this application only (your profile stays unchanged).
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
              {applicationId && (
                <Button variant="secondary" onClick={() => handleApply(false)} disabled={applying}>
                  {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Use for this application only
                </Button>
              )}
              <Button onClick={() => handleApply(true)} disabled={applying}>
                {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Apply to profile
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EligibilityCard({ grantId, applicationId }: { grantId: string; applicationId?: string }) {
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
              Get a GrantsCopilot assessment of how well your business fits this grant. We may show a cached score if we&apos;ve already assessed it.
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
                Eligibility: {score}%
              </span>
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
                <p className="mb-2 text-xs font-medium text-muted-foreground">Why you scored {score}%</p>
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
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleCheck(true)} disabled={loading}>
                {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Re-check (fresh GrantsCopilot)
              </Button>
              {score < 85 && (result.improvementPlan?.actions?.length || result.missing?.length) ? (
                <AutoImproveButton grantId={grantId} applicationId={applicationId} />
              ) : null}
            </div>
          </>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
