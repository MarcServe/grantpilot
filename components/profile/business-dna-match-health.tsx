"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { MatchHealthReport } from "@/lib/match-health";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SuggestionMap = {
  missionStatement?: string;
  description?: string;
  fundingDetails?: string;
  innovationCapabilities?: string;
  socialImpact?: string;
  teamExpertise?: string;
  fundingPurposes?: string[];
  rationale?: string[];
  safeguards?: string[];
};

type ProfileSnapshot = Record<string, unknown>;

const FIELD_LABELS: Record<Exclude<keyof SuggestionMap, "rationale" | "safeguards">, string> = {
  missionStatement: "Mission statement",
  description: "Business description",
  fundingDetails: "Funding use summary",
  innovationCapabilities: "Innovation and R&D",
  socialImpact: "Social impact",
  teamExpertise: "Team expertise",
  fundingPurposes: "Funding purposes",
};

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" ? value : "";
}

function suggestedFieldEntries(suggestions: SuggestionMap) {
  return (Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).filter((field) => {
    const value = suggestions[field];
    return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;
  });
}

export function BusinessDnaMatchHealth({
  report,
  profile,
}: {
  report: MatchHealthReport;
  profile: ProfileSnapshot;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionMap | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const fields = useMemo(() => suggestedFieldEntries(suggestions ?? {}), [suggestions]);

  if (!report.shouldPrompt) return null;

  function loadSuggestions() {
    setOpen(true);
    if (suggestions || isPending) return;
    startTransition(() => {
      void (async () => {
      try {
        const res = await fetch("/api/profile/match-health/improve", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not generate Business DNA suggestions");
        const nextSuggestions = (data.suggestions ?? {}) as SuggestionMap;
        const nextFields = suggestedFieldEntries(nextSuggestions);
        setSuggestions(nextSuggestions);
        setSelected(new Set(nextFields));
        if (nextFields.length === 0) {
          toast.info("No safe AI rewrite found. Add the missing evidence manually in your profile.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not generate Business DNA suggestions");
      }
      })();
    });
  }

  function applySuggestions() {
    if (!suggestions || selected.size === 0) {
      toast.error("Select at least one improvement to apply.");
      return;
    }
    const updates: Record<string, unknown> = {};
    for (const field of selected) {
      const value = suggestions[field as keyof SuggestionMap];
      if (Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0) {
        updates[field] = value;
      }
    }
    startTransition(() => {
      void (async () => {
      try {
        const res = await fetch("/api/profile/match-health/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not apply Business DNA improvements");
        toast.success("Business DNA updated. A fresh eligibility refresh has been queued.");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not apply Business DNA improvements");
      }
      })();
    });
  }

  return (
    <>
      <Card className="mb-6 border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <h2 className="font-semibold text-amber-950 dark:text-amber-100">{report.promptTitle}</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-amber-900 dark:text-amber-200">{report.promptBody}</p>
            </div>
            <Button type="button" onClick={loadSuggestions} className="shrink-0 gap-2">
              <Sparkles className="h-4 w-4" />
              Improve Business DNA
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{report.currentHighMatches} current 85%+ matches</Badge>
            <Badge variant="outline">{report.currentWithinReach} within reach</Badge>
            {report.daysSinceHighMatch != null && (
              <Badge variant="outline">{report.daysSinceHighMatch} days since latest 85%+ match</Badge>
            )}
          </div>
          {report.topBlockers.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {report.topBlockers.slice(0, 4).map((blocker) => (
                <div key={blocker.reason} className="rounded-md border border-amber-200 bg-white/70 p-3 text-sm dark:bg-background/60">
                  <div className="font-medium">{blocker.label}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{blocker.detail}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Improve Business DNA coverage</DialogTitle>
            <DialogDescription>
              AI can only rewrite and broaden facts already in your profile. Select the edits you want to apply.
            </DialogDescription>
          </DialogHeader>

          {isPending && !suggestions ? (
            <div className="space-y-3 py-6">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-24 animate-pulse rounded bg-muted" />
              <div className="h-24 animate-pulse rounded bg-muted" />
            </div>
          ) : fields.length === 0 ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              No safe rewrite was generated. Add the missing evidence manually, then run eligibility again.
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((field) => (
                <div key={field} className="rounded-lg border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={selected.has(field)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selected);
                        if (checked) next.add(field);
                        else next.delete(field);
                        setSelected(next);
                      }}
                    />
                    {FIELD_LABELS[field]}
                  </label>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md bg-muted/50 p-3">
                      <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Current</div>
                      <p className="whitespace-pre-wrap text-sm">{displayValue(profile[field]) || "Not provided"}</p>
                    </div>
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                      <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase text-primary">
                        <CheckCircle2 className="h-3 w-3" />
                        Suggested
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{displayValue(suggestions?.[field])}</p>
                    </div>
                  </div>
                </div>
              ))}
              {(suggestions?.safeguards?.length ?? 0) > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="font-medium">Facts to add manually</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {suggestions?.safeguards?.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applySuggestions} disabled={isPending || fields.length === 0}>
              Apply selected improvements
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
