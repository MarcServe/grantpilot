"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, CheckCircle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

const DNA_DRAFT_STORAGE_KEY = "grantpilot.company_dna_autofill.v1";

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
  companyDnaAutofillEnabled,
}: {
  hasWebsiteUrl: boolean;
  hasWebsiteIntelligence: boolean;
  companyDnaAutofillEnabled: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<DnaSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [draftRestored, setDraftRestored] = useState(false);

  const selectedCount = selected.size;
  const selectedUpdates = useMemo(() => {
    const updates: Record<string, string> = {};
    for (const suggestion of suggestions) {
      const value = editedValues[suggestion.field] ?? suggestion.value;
      if (selected.has(suggestion.field) && value.trim()) updates[suggestion.field] = value.trim();
    }
    return updates;
  }, [editedValues, selected, suggestions]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DNA_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        suggestions?: DnaSuggestion[];
        selected?: string[];
        editedValues?: Record<string, string>;
      };
      if (!Array.isArray(parsed.suggestions) || parsed.suggestions.length === 0) return;
      const restoredSuggestions = parsed.suggestions.filter(
        (item) =>
          item &&
          typeof item.field === "string" &&
          typeof item.label === "string" &&
          typeof item.value === "string"
      );
      if (restoredSuggestions.length === 0) return;
      setSuggestions(restoredSuggestions);
      setSelected(new Set(Array.isArray(parsed.selected) ? parsed.selected : []));
      setEditedValues(parsed.editedValues && typeof parsed.editedValues === "object" ? parsed.editedValues : {});
      setDraftRestored(true);
    } catch {
      window.localStorage.removeItem(DNA_DRAFT_STORAGE_KEY);
    }
  }, []);

  if (!companyDnaAutofillEnabled) {
    return (
      <Card id="business-dna-generator" className="scroll-mt-24 overflow-hidden rounded-2xl border-muted bg-muted/20">
        <CardHeader className="px-4 pb-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" />
            AI Business DNA generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 sm:px-6">
          <p className="text-sm text-muted-foreground">
            Turn website intelligence into structured profile fields with one click. Included on Growth, Pro, and Business.
          </p>
          <Button asChild variant="outline" size="sm" className="w-fit gap-2">
            <Link href="/billing">View plans</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  function persistDraft(
    nextSuggestions: DnaSuggestion[],
    nextSelected: Set<string>,
    nextEditedValues: Record<string, string>
  ) {
    if (nextSuggestions.length === 0) {
      window.localStorage.removeItem(DNA_DRAFT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      DNA_DRAFT_STORAGE_KEY,
      JSON.stringify({
        suggestions: nextSuggestions,
        selected: [...nextSelected],
        editedValues: nextEditedValues,
        savedAt: new Date().toISOString(),
      })
    );
  }

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/profile/company-dna", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 402) {
          toast.error(data.error ?? "Upgrade required", {
            action: { label: "Billing", onClick: () => router.push("/billing") },
          });
        } else {
          toast.error(data.error ?? "Could not generate Company DNA suggestions");
        }
        return;
      }
      const next: DnaSuggestion[] = Array.isArray(data.suggestions) ? data.suggestions : [];
      const nextEditedValues = Object.fromEntries(
        next.map((item: DnaSuggestion) => [item.field, item.value])
      );
      const nextSelected = new Set<string>(next.slice(0, 6).map((item: DnaSuggestion) => item.field));
      setSuggestions(next);
      setEditedValues(nextEditedValues);
      setSelected(nextSelected);
      setDraftRestored(false);
      persistDraft(next, nextSelected, nextEditedValues);
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
        if (res.status === 402) {
          toast.error(data.error ?? "Upgrade required", {
            action: { label: "Billing", onClick: () => router.push("/billing") },
          });
        } else {
          toast.error(data.error ?? "Could not apply profile updates");
        }
        return;
      }
      toast.success(`Applied ${data.applied?.length ?? selectedCount} profile updates`);
      setSuggestions([]);
      setEditedValues({});
      setSelected(new Set());
      setDraftRestored(false);
      persistDraft([], new Set(), {});
      router.refresh();
    } catch {
      toast.error("Could not apply profile updates");
    } finally {
      setApplying(false);
    }
  }

  function updateSuggestion(field: string, value: string) {
    setEditedValues((prev) => {
      const next = { ...prev, [field]: value };
      persistDraft(suggestions, selected, next);
      return next;
    });
  }

  function toggle(field: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(field);
      else next.delete(field);
      persistDraft(suggestions, next, editedValues);
      return next;
    });
  }

  return (
    <Card id="business-dna-generator" className="scroll-mt-24 overflow-hidden rounded-2xl border-primary/20 bg-primary/5">
      <CardHeader className="px-4 pb-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" />
            AI Business DNA generator
          </CardTitle>
          {hasWebsiteIntelligence && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              DNA ready
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 px-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Generate structured Business DNA from the company website, then approve the fields you want to save.
          </p>
          <Button
            type="button"
            onClick={generate}
            disabled={loading || !hasWebsiteUrl}
            className="w-full shrink-0 gap-2 sm:w-auto"
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

        {draftRestored && suggestions.length > 0 && (
          <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Restored your unsaved Company DNA draft from this browser.
          </p>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-3">
            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
              {suggestions.map((suggestion) => {
                const editedValue = editedValues[suggestion.field] ?? suggestion.value;
                return (
                <label
                  key={suggestion.field}
                  className="block cursor-pointer rounded-xl border bg-background p-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
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
                      <Textarea
                        value={editedValue}
                        onChange={(event) => updateSuggestion(suggestion.field, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-2 min-h-[120px] max-w-full resize-y overflow-x-hidden bg-white text-base leading-7 sm:text-sm"
                        aria-label={`Edit ${suggestion.label}`}
                      />
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{editedValue.trim().length} characters</span>
                        {editedValue !== suggestion.value && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              updateSuggestion(suggestion.field, suggestion.value);
                            }}
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">{selectedCount} selected</p>
              <Button type="button" onClick={applySelected} disabled={applying || selectedCount === 0} className="w-full gap-2 sm:w-auto">
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
