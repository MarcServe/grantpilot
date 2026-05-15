"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BookmarkPlus, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

type State = "saved" | "deferred" | "applied";

export function GrantStateActions({ grantId }: { grantId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<State | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);

  async function mark(status: State) {
    setLoading(status);
    try {
      const res = await fetch("/api/grants/user-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update grant");
      if (typeof data.applicationId === "string") setApplicationId(data.applicationId);
      toast.success(
        status === "applied"
          ? "Added to Applications. Reminders for this grant are stopped; mark it submitted after sending it to the funder."
          : status === "deferred"
            ? "Deferred for later. We will not resend eligibility reminders for it."
            : "Saved to your list."
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  const icon = (status: State) => loading === status ? <Loader2 className="h-4 w-4 animate-spin" /> : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="gap-2" onClick={() => mark("deferred")} disabled={loading != null}>
          {icon("deferred") ?? <Clock3 className="h-4 w-4" />}
          Defer for later
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => mark("saved")} disabled={loading != null}>
          {icon("saved") ?? <BookmarkPlus className="h-4 w-4" />}
          Save
        </Button>
        <Button className="gap-2" onClick={() => mark("applied")} disabled={loading != null}>
          {icon("applied") ?? <CheckCircle2 className="h-4 w-4" />}
          Add to Applications
        </Button>
        {applicationId && (
          <Link href={`/applications/${applicationId}`}>
            <Button variant="secondary">Open application</Button>
          </Link>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Applied means you are tracking the grant and no longer want eligibility reminders. Submitted means the funder form has been sent, so you can record outcomes later.
      </p>
    </div>
  );
}
