"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileCheck, AlertTriangle, Zap } from "lucide-react";
import { toast } from "sonner";

interface RequiredAttachment {
  kind: string;
  label: string;
  maxDurationMinutes?: number;
  maxSizeMB?: number;
  categoryHint?: string;
}

const AUTOPILOT_ELIGIBILITY_THRESHOLD = 85;

interface ApplyButtonProps {
  grantId: string;
  profileId: string;
  /** Cached eligibility score (0–100). When >= 85, autopilot is suggested and pre-checked. */
  eligibilityScore?: number;
}

export function ApplyButton({ grantId, profileId, eligibilityScore }: ApplyButtonProps) {
  const suggestAutopilot = eligibilityScore != null && eligibilityScore >= AUTOPILOT_ELIGIBILITY_THRESHOLD;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);
  const [missing, setMissing] = useState<RequiredAttachment[]>([]);
  const [required, setRequired] = useState<RequiredAttachment[]>([]);
  const [autopilot, setAutopilot] = useState(suggestAutopilot);
  const router = useRouter();

  useEffect(() => {
    if (!open || !grantId || !profileId) return;
    setCheckLoading(true);
    fetch(
      `/api/applications/start-check?grantId=${encodeURIComponent(grantId)}&profileId=${encodeURIComponent(profileId)}`
    )
      .then((r) => r.json())
      .then((data) => {
        setRequired(data.requiredAttachments ?? []);
        setMissing(data.missing ?? []);
      })
      .catch(() => {
        setRequired([]);
        setMissing([]);
      })
      .finally(() => setCheckLoading(false));
  }, [open, grantId, profileId]);

  async function handleApply() {
    setLoading(true);
    try {
      const res = await fetch("/api/applications/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId, profileId, autopilot: autopilot || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Failed to start application");
        toast.error(msg);
        return;
      }

      toast.success(autopilot ? "Application started! AI will fill and submit." : "Application started! AI is processing your application.");
      setOpen(false);
      router.push(`/applications/${data.applicationId}`);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

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
          Apply with AI
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start AI Application</DialogTitle>
          <DialogDescription>
            Grants-Copilot will use your business profile to fill in the grant
            application. By default the AI pauses for your review before
            submission; turn on Autopilot to submit without approval.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted p-4 text-sm">
          <ul className="space-y-2">
            <li>1. AI opens the grant application form</li>
            <li>2. Fills in company details from your profile</li>
            <li>3. Prepares financial information</li>
            <li>4. Uploads supporting documents and videos</li>
            <li>5. {autopilot ? "Submits the application (Autopilot)" : "Pauses for your review before submission"}</li>
          </ul>
        </div>
        {suggestAutopilot && (
          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
            You&apos;re {eligibilityScore}% eligible — autopilot suggested for this grant (submit without approval).
          </p>
        )}
        <div className="flex items-center gap-2">
          <Checkbox
            id="autopilot-catalog"
            checked={autopilot}
            onCheckedChange={(c) => setAutopilot(c === true)}
          />
          <Label htmlFor="autopilot-catalog" className="flex items-center gap-1.5 cursor-pointer font-normal text-sm">
            <Zap className="h-4 w-4 text-amber-500" />
            Autopilot: submit without asking for approval
          </Label>
        </div>
        {checkLoading ? (
          <p className="text-sm text-muted-foreground">Checking grant requirements…</p>
        ) : missing.length > 0 && required.length > 0 ? (
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
          <Button onClick={handleApply} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
