"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

export interface NeedsInputField {
  selector: string;
  label: string;
  hint?: string;
}

interface NeedsInputFormProps {
  applicationId: string;
  needsInput: NeedsInputField[];
}

function questionKey(label: string): string {
  return label
    .replace(/yes\s*no\s*this question is.*$/gi, " ")
    .replace(/yesno.*$/gi, " ")
    .replace(/\b(single|multiple)\s+choice\b/gi, " ")
    .replace(/\bthis question is\b.*$/gi, " ")
    .replace(/\b(yes|no|option)\b/gi, " ")
    .replace(/^\s*\d+\s*[\.)-]?\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayLabel(label: string): string {
  const cleaned = label
    .replace(/yes\s*no\s*this question is.*$/gi, " ")
    .replace(/yesno.*$/gi, " ")
    .replace(/\b(single|multiple)\s+choice\b/gi, " ")
    .replace(/\bthis question is\b.*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || label;
}

function displayHint(field: NeedsInputField): string | undefined {
  if (/option,\s*option/i.test(field.hint ?? "") && /yes\s*no|yesno/i.test(field.label)) {
    return "Choose one of: Yes, No";
  }
  return field.hint;
}

function dedupeNeedsInput(fields: NeedsInputField[]): NeedsInputField[] {
  const seen = new Map<string, NeedsInputField>();
  const score = (field: NeedsInputField) => {
    const genericHint = /\boption\b/i.test(field.hint ?? "");
    const usefulChoiceHint = /\b(yes|no)\b/i.test(field.hint ?? "");
    return (usefulChoiceHint ? 10 : 0) - (genericHint ? 5 : 0) + (field.hint?.length ?? 0) / 1000;
  };
  for (const field of fields) {
    const key = questionKey(field.label) || field.selector;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, field);
      continue;
    }
    if (score(field) > score(existing)) seen.set(key, field);
  }
  return Array.from(seen.values());
}

export function NeedsInputForm({ applicationId, needsInput }: NeedsInputFormProps) {
  const router = useRouter();
  const visibleNeedsInput = dedupeNeedsInput(needsInput);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit-needs-input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to submit");
        return;
      }
      toast.success("Details saved. The AI will continue filling your application.");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (visibleNeedsInput.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="text-amber-900">We need a few details</CardTitle>
        <p className="text-sm text-amber-800">
          The grant form requires some information we don&apos;t have in your profile. Fill in the fields below and click Resume so our AI can continue.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {visibleNeedsInput.map((field) => (
            <div key={field.selector} className="space-y-2">
              <Label htmlFor={`need-${field.selector}`} className="text-amber-900">
                {displayLabel(field.label)}
              </Label>
              {displayHint(field) && (
                <p className="text-xs text-amber-700">{displayHint(field)}</p>
              )}
              <Input
                id={`need-${field.selector}`}
                type="text"
                value={answers[field.label] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [field.label]: e.target.value }))
                }
                className="bg-white border-amber-200"
                placeholder={`Enter ${displayLabel(field.label).toLowerCase()}`}
              />
            </div>
          ))}
          <Button type="submit" disabled={submitting} className="gap-2">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {submitting ? "Saving…" : "Submit & Resume"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
