"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, FileCheck, AlertTriangle } from "lucide-react";

interface RequiredAttachment {
  kind: string;
  label: string;
  maxDurationMinutes?: number;
  maxSizeMB?: number;
  categoryHint?: string;
}

interface ApplyButtonProps {
  grantId: string;
  profileId: string;
  applicationUrl?: string | null;
  /** Cached eligibility score (0–100). */
  eligibilityScore?: number;
}

export function ApplyButton({ grantId, profileId, applicationUrl, eligibilityScore }: ApplyButtonProps) {
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState<RequiredAttachment[]>([]);
  const [required, setRequired] = useState<RequiredAttachment[]>([]);
  const [focusNotes, setFocusNotes] = useState("");

  useEffect(() => {
    if (!open || !grantId || !profileId) return;
    let cancelled = false;
    fetch(
      `/api/applications/start-check?grantId=${encodeURIComponent(grantId)}&profileId=${encodeURIComponent(profileId)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRequired(data.requiredAttachments ?? []);
        setMissing(data.missing ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setRequired([]);
        setMissing([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, grantId, profileId]);

  const missingSummary = missing.length > 0
    ? missing
        .map((m) =>
          m.maxDurationMinutes || m.maxSizeMB
            ? `${m.label}${m.maxDurationMinutes ? ` (max ${m.maxDurationMinutes} min)` : ""}${m.maxSizeMB ? `, ${m.maxSizeMB}MB` : ""}`
            : m.label
        )
        .join(", ")
    : "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <FileCheck className="h-4 w-4" />
          Prepare Application
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prepare this application</DialogTitle>
          <DialogDescription>
            Version 1 helps you qualify, prepare answers, collect documents, and apply faster. You submit on the
            official funder site, then track the result in GrantsCopilot.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted p-4 text-sm">
          <ul className="space-y-2">
            <li>1. Review the eligibility fit and any gaps for this grant</li>
            <li>2. Use your company DNA to draft answers and supporting material</li>
            <li>3. Check required documents before opening the funder form</li>
            <li>4. Apply on the official funder site with your prepared pack</li>
            <li>5. Track the outcome so GrantsCopilot stops re-sending the same grant</li>
          </ul>
        </div>
        {eligibilityScore != null && eligibilityScore >= 85 && (
          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
            You&apos;re {eligibilityScore}% eligible. Use the prep tools to draft your answers before applying on the funder site.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="focus-notes" className="text-sm font-medium">
            Focus notes for this application <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="focus-notes"
            value={focusNotes}
            onChange={(e) => setFocusNotes(e.target.value)}
            placeholder="e.g. Emphasise our sustainability work and community partnerships for this grant. Mention our NHS pilot results."
            rows={2}
            className="resize-y text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Keep these notes for your drafting workflow. Grant-specific AI drafting and designed packs are available from the Founder Pack.
          </p>
        </div>
        {missing.length > 0 && required.length > 0 ? (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                This grant may require:
              </p>
              <p className="mt-1 text-amber-700 dark:text-amber-300">{missingSummary}</p>
              <p className="mt-2">
                <Link
                  href="/profile"
                  className="underline hover:no-underline"
                  onClick={() => setOpen(false)}
                >
                  Add these in Profile → Documents
                </Link>{" "}
                or continue and upload manually on the grant form.
              </p>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Link href={`/founder-pack?grantId=${encodeURIComponent(grantId)}`} onClick={() => setOpen(false)}>
            <Button variant="outline">
              Generate prep docs
            </Button>
          </Link>
          {applicationUrl ? (
            <a href={applicationUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              <Button>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open funder form
              </Button>
            </a>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
