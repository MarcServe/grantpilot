"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, CheckCircle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

interface DnaSuggestion {
  field: string;
  label: string;
  value: string;
  confidence?: number;
  reason?: string;
}

export function CompanyDnaAutofill({
  hasWebsiteUrl,
  hasWebsiteIntelligence,
}: {
  hasWebsiteUrl: boolean;
  hasWebsiteIntelligence: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<DnaSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectedCount = selected.size;
  const selectedUpdates = useMemo(() => {
    const updates: Record<string, string> = {};
    for (const suggestion of suggestions) {
      if (selected.has(suggestion.field)) updates[suggestion.field] = suggestion.value;
    }
    return updates;
  }, [selected, suggestions]);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/profile/company-dna", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not generate Company DNA suggestions");
        return;
      }
      const next = Array.isArray(data.suggestions) ? data.suggestions : [];
      setSuggestions(next);
      setSelected(new Set(next.slice(0, 6).map((item: DnaSuggestion) => item.field)));
      if (next.length === 0) {
        toast.info("No strong profile suggestions found from the current company DNA.");
      } else {
        toast.success(`Found ${next.length} profile suggestions`);
      }
    } catch {
      toast.error("Could not generate Company DNA suggestions");
    } finally {
      setLoading(false);
    }
  }

  async function applySelected() {
    if (selectedCount === 0) {
      toast.error("Select at least one suggestion");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/profile/company-dna", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: selectedUpdates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not apply profile updates");
        return;
      }
      toast.success(`Applied ${data.applied?.length ?? selectedCount} profile updates`);
      setSuggestions([]);
      setSelected(new Set());
      router.refresh();
    } catch {
      toast.error("Could not apply profile updates");
    } finally {
      setApplying(false);
    }
  }

  function toggle(field: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(field);
      else next.delete(field);
      return next;
    });
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" />
            Company DNA Autofill
          </CardTitle>
          {hasWebsiteIntelligence && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              DNA ready
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Generate structured profile updates from the company website, then approve the fields you want to save.
          </p>
          <Button
            type="button"
            onClick={generate}
            disabled={loading || !hasWebsiteUrl}
            className="shrink-0 gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </Button>
        </div>

        {!hasWebsiteUrl && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Add your company website in Business Basics first.
          </p>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-3">
            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
              {suggestions.map((suggestion) => (
                <label
                  key={suggestion.field}
                  className="block cursor-pointer rounded-md border bg-background p-3"
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(suggestion.field)}
                      onCheckedChange={(value) => toggle(suggestion.field, value === true)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{suggestion.label}</span>
                        {suggestion.confidence != null && (
                          <Badge variant="secondary" className="text-[11px]">
                            {Math.round(suggestion.confidence * 100)}%
                          </Badge>
                        )}
                      </div>
                      {suggestion.reason && (
                        <p className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</p>
                      )}
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{suggestion.value}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">{selectedCount} selected</p>
              <Button type="button" onClick={applySelected} disabled={applying || selectedCount === 0} className="gap-2">
                {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                Apply selected
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
