"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BookmarkPlus, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { toast } from "sonner";

type State = "saved" | "deferred" | "applied";

export function GrantStateActions({ grantId }: { grantId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<State | null>(null);

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
      toast.success(
        status === "applied"
          ? "Marked as applied. Eligibility reminders for this grant are stopped."
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
        Mark applied
      </Button>
    </div>
  );
}
