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
  { value: "shortlisted", label: "Shortlisted" },
  { value: "awarded", label: "Awarded" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "unknown", label: "Final outcome unclear" },
] as const;

type OutcomeValue = "applied" | (typeof OUTCOME_OPTIONS)[number]["value"];

interface ExistingOutcome {
  outcome?: OutcomeValue;
  awardedAmount?: number | null;
  funderFeedback?: string | null;
  responseText?: string | null;
  responseScreenshotName?: string | null;
  responseScreenshotDataUrl?: string | null;
  learningNotes?: string | null;
}

interface OutcomeLearningInsight {
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  nextActions?: string[];
  scoringAdjustment?: number;
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

function parseLearningInsight(value?: string | null): OutcomeLearningInsight | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { insight?: OutcomeLearningInsight | null };
    return parsed.insight ?? null;
  } catch {
    return null;
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
  const [outcome, setOutcome] = useState<OutcomeValue | "">(existingOutcome?.outcome ?? "");
  const [awardedAmount, setAwardedAmount] = useState(
    existingOutcome?.awardedAmount != null ? String(existingOutcome.awardedAmount) : ""
  );
  const [funderFeedback, setFunderFeedback] = useState(existingOutcome?.funderFeedback ?? "");
  const [responseText, setResponseText] = useState(existingOutcome?.responseText ?? "");
  const [responseScreenshotName, setResponseScreenshotName] = useState(existingOutcome?.responseScreenshotName ?? "");
  const [responseScreenshotDataUrl, setResponseScreenshotDataUrl] = useState(existingOutcome?.responseScreenshotDataUrl ?? "");
  const [learningNotes, setLearningNotes] = useState(parseLearningNotes(existingOutcome?.learningNotes));
  const [savedInsight, setSavedInsight] = useState<OutcomeLearningInsight | null>(
    parseLearningInsight(existingOutcome?.learningNotes)
  );

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
    const hasEvidence = Boolean(
      funderFeedback.trim() ||
        responseText.trim() ||
        responseScreenshotDataUrl.trim() ||
        learningNotes.trim()
    );
    if (!outcome) {
      toast.error(
        hasEvidence
          ? "Select the final funder outcome before saving this evidence."
          : "Select the final funder outcome."
      );
      return;
    }
    if ((outcome === "applied" || outcome === "unknown") && hasEvidence) {
      toast.error("This response evidence still needs a final decision: awarded, rejected, shortlisted, or withdrawn.");
      return;
    }

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
      setSavedInsight((data.insight ?? null) as OutcomeLearningInsight | null);
      toast.success("Outcome saved. Future eligibility scoring will use this signal.");
      router.refresh();
    } catch {
      toast.error("Could not save outcome");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="outcome-learning" className="mb-6 scroll-mt-24 border-primary/20">
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
              <option value="">Select final outcome</option>
              {outcome === "applied" && <option value="applied">Applied (not final)</option>}
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
        {savedInsight?.summary && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Learning signal saved</p>
              {typeof savedInsight.scoringAdjustment === "number" && (
                <span className="rounded-full bg-background px-2 py-1 text-xs font-medium text-muted-foreground">
                  {savedInsight.scoringAdjustment >= 0 ? "+" : ""}{savedInsight.scoringAdjustment} scoring calibration
                </span>
              )}
            </div>
            <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{savedInsight.summary}</p>
            <LearningInsightList title="Strengths to repeat" items={savedInsight.strengths} />
            <LearningInsightList title="Gaps to improve" items={savedInsight.weaknesses} />
            <LearningInsightList title="Next actions" items={savedInsight.nextActions} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LearningInsightList({ title, items }: { title: string; items?: string[] }) {
  const list = Array.isArray(items) ? items.filter(Boolean).slice(0, 4) : [];
  if (list.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-foreground">
        {list.map((item) => (
          <li key={item} className="break-words">- {item}</li>
        ))}
      </ul>
    </div>
  );
}
