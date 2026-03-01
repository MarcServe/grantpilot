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
import { Loader2, FileCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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
}

export function ApplyButton({ grantId, profileId }: ApplyButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);
  const [missing, setMissing] = useState<RequiredAttachment[]>([]);
  const [required, setRequired] = useState<RequiredAttachment[]>([]);
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
        body: JSON.stringify({ grantId, profileId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to start application");
        return;
      }

      toast.success("Application started! AI is processing your application.");
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
            GrantPilot will use your business profile to fill in the grant
            application. The AI will prepare everything and pause for your
            review before any submission.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted p-4 text-sm">
          <ul className="space-y-2">
            <li>1. AI opens the grant application form</li>
            <li>2. Fills in company details from your profile</li>
            <li>3. Prepares financial information</li>
            <li>4. Uploads supporting documents and videos</li>
            <li>5. Pauses for your review before submission</li>
          </ul>
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
