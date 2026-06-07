"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type GrantDraft = {
  externalId?: string | null;
  name: string;
  funder: string;
  amount?: number | null;
  deadline?: string | null;
  applicationUrl: string;
  eligibility: string;
  description?: string | null;
  objectives?: string | null;
  sectors?: string[];
  regions?: string[];
  funderLocations?: string[];
  applicantTypes?: string[];
};

type PublishResult = {
  grantId: string;
  created: boolean;
  health?: { status: string; reason: string };
};

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value?: string[]): string {
  return value?.join(", ") ?? "";
}

export function GrantComposer() {
  const [rawText, setRawText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<GrantDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);

  async function generateDraft() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/grants/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: rawText.trim() || undefined,
          sourceUrl: sourceUrl.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not generate draft");
      setDraft(data.draft);
      toast.success("Grant draft generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate draft");
    } finally {
      setLoading(false);
    }
  }

  async function publishDraft() {
    if (!draft) return;
    setPublishing(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/grants/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish: true, draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not publish grant");
      setResult(data);
      toast.success(data.created ? "Grant published" : "Grant updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish grant");
    } finally {
      setPublishing(false);
    }
  }

  function updateDraft<K extends keyof GrantDraft>(key: K, value: GrantDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI grant composer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Paste raw grant text, copied webpage content, or a source URL. OpenAI converts it into the structured grant
          format, then you review and publish it after URL verification.
        </p>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="min-w-0 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="composer-url">Source URL</Label>
              <Input
                id="composer-url"
                placeholder="https://funder.example/grants/example-programme"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="composer-notes">Admin notes</Label>
              <Textarea
                id="composer-notes"
                rows={3}
                placeholder="Add deadline notes, target sector, or what to prioritise from the page."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="composer-raw">Grant text or copied page content</Label>
              <Textarea
                id="composer-raw"
                rows={10}
                placeholder="Paste programme details, eligibility, funding amount, deadline, and application instructions."
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
              />
            </div>
            <Button type="button" onClick={generateDraft} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate draft
            </Button>
          </div>

          <div className="min-w-0 space-y-4">
            {!draft ? (
              <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                Generated grant drafts appear here for review before publishing.
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium">Review draft</p>
                  <Badge variant="outline">Source: admin</Badge>
                </div>
                <DraftInput label="Grant name" value={draft.name} onChange={(value) => updateDraft("name", value)} />
                <DraftInput label="Funder" value={draft.funder} onChange={(value) => updateDraft("funder", value)} />
                <DraftInput
                  label="Application URL"
                  value={draft.applicationUrl}
                  onChange={(value) => updateDraft("applicationUrl", value)}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <DraftInput
                    label="Amount"
                    value={draft.amount == null ? "" : String(draft.amount)}
                    onChange={(value) => {
                      const next = Number(value);
                      updateDraft("amount", value.trim() && Number.isFinite(next) ? next : null);
                    }}
                  />
                  <DraftInput
                    label="Deadline"
                    value={draft.deadline ?? ""}
                    onChange={(value) => updateDraft("deadline", value.trim() || null)}
                  />
                </div>
                <DraftTextarea
                  label="Eligibility"
                  value={draft.eligibility}
                  onChange={(value) => updateDraft("eligibility", value)}
                />
                <DraftTextarea
                  label="Description"
                  value={draft.description ?? ""}
                  onChange={(value) => updateDraft("description", value.trim() || null)}
                />
                <DraftTextarea
                  label="Objectives"
                  value={draft.objectives ?? ""}
                  onChange={(value) => updateDraft("objectives", value.trim() || null)}
                />
                <DraftInput
                  label="Sectors"
                  value={joinList(draft.sectors)}
                  onChange={(value) => updateDraft("sectors", splitList(value))}
                />
                <DraftInput
                  label="Regions"
                  value={joinList(draft.regions)}
                  onChange={(value) => updateDraft("regions", splitList(value))}
                />
                <DraftInput
                  label="Funder locations"
                  value={joinList(draft.funderLocations)}
                  onChange={(value) => updateDraft("funderLocations", splitList(value))}
                />
                <DraftInput
                  label="Applicant types"
                  value={joinList(draft.applicantTypes)}
                  onChange={(value) => updateDraft("applicantTypes", splitList(value))}
                />
                <Button type="button" onClick={publishDraft} disabled={publishing} className="w-full gap-2">
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Verify URL and publish
                </Button>
              </div>
            )}

            {result && (
              <div className="break-words rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-800">
                {result.created ? "Created" : "Updated"} grant <strong>{result.grantId}</strong>
                {result.health && <>. URL status: {result.health.status} ({result.health.reason})</>}.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DraftInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `draft-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function DraftTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `draft-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
