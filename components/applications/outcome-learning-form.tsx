"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const OUTCOME_OPTIONS = [
  { value: "applied", label: "Applied" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "awarded", label: "Awarded" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "unknown", label: "Unknown" },
] as const;

type OutcomeValue = (typeof OUTCOME_OPTIONS)[number]["value"];

interface ExistingOutcome {
  outcome?: OutcomeValue;
  awardedAmount?: number | null;
  funderFeedback?: string | null;
  responseText?: string | null;
  responseScreenshotName?: string | null;
  responseScreenshotDataUrl?: string | null;
  learningNotes?: string | null;
}

function parseLearningNotes(value?: string | null): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as { userNotes?: string | null };
    return parsed.userNotes ?? "";
  } catch {
    return value;
  }
}

export function OutcomeLearningForm({
  applicationId,
  existingOutcome,
}: {
  applicationId: string;
  existingOutcome?: ExistingOutcome | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeValue>(existingOutcome?.outcome ?? "applied");
  const [awardedAmount, setAwardedAmount] = useState(
    existingOutcome?.awardedAmount != null ? String(existingOutcome.awardedAmount) : ""
  );
  const [funderFeedback, setFunderFeedback] = useState(existingOutcome?.funderFeedback ?? "");
  const [responseText, setResponseText] = useState(existingOutcome?.responseText ?? "");
  const [responseScreenshotName, setResponseScreenshotName] = useState(existingOutcome?.responseScreenshotName ?? "");
  const [responseScreenshotDataUrl, setResponseScreenshotDataUrl] = useState(existingOutcome?.responseScreenshotDataUrl ?? "");
  const [learningNotes, setLearningNotes] = useState(parseLearningNotes(existingOutcome?.learningNotes));

  function handleScreenshot(file?: File) {
    if (!file) return;
    if (file.size > 1_500_000) {
      toast.error("Screenshot is too large. Upload an image under 1.5MB for now.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setResponseScreenshotName(file.name);
      setResponseScreenshotDataUrl(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => toast.error("Could not read screenshot");
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          awardedAmount: awardedAmount.trim() ? Number(awardedAmount) : null,
          funderFeedback,
          responseText,
          responseScreenshotName,
          responseScreenshotDataUrl,
          learningNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not save outcome");
        return;
      }
      toast.success("Outcome saved. Funding intelligence will use this signal.");
      router.refresh();
    } catch {
      toast.error("Could not save outcome");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="h-4 w-4" />
          Outcome Learning
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Record the result so GrantPilot can learn which funders, sectors, answers, and evidence patterns work.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="outcome">Outcome</Label>
            <select
              id="outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as OutcomeValue)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {OUTCOME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="awardedAmount">Awarded amount</Label>
            <Input
              id="awardedAmount"
              type="number"
              min="0"
              placeholder="Optional"
              value={awardedAmount}
              onChange={(event) => setAwardedAmount(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="funderFeedback">Funder feedback</Label>
          <Textarea
            id="funderFeedback"
            rows={3}
            value={funderFeedback}
            onChange={(event) => setFunderFeedback(event.target.value)}
            placeholder="Paste reviewer notes, rejection reason, shortlist message, or award feedback."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="responseText">Funder response text</Label>
          <Textarea
            id="responseText"
            rows={4}
            value={responseText}
            onChange={(event) => setResponseText(event.target.value)}
            placeholder="Paste the email, portal message, reviewer response, or award/rejection wording exactly as received."
          />
          <p className="text-xs text-muted-foreground">
            This is used as outcome-learning evidence so future scoring and document drafts become more accurate.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="responseScreenshot">Screenshot response</Label>
          <Input
            id="responseScreenshot"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => handleScreenshot(event.target.files?.[0])}
          />
          {responseScreenshotName && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Saved evidence: <span className="font-medium text-foreground">{responseScreenshotName}</span>
              {responseScreenshotDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={responseScreenshotDataUrl} alt="Outcome response screenshot preview" className="mt-2 max-h-48 rounded border object-contain" />
              )}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="learningNotes">Internal notes</Label>
          <Textarea
            id="learningNotes"
            rows={3}
            value={learningNotes}
            onChange={(event) => setLearningNotes(event.target.value)}
            placeholder="What seemed to work? What evidence was missing? What should the AI improve next time?"
          />
        </div>
        <Button type="button" onClick={save} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save outcome signal
        </Button>
      </CardContent>
    </Card>
  );
}
