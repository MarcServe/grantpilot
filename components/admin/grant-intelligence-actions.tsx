"use client";

import { useState, useTransition } from "react";
import { BrainCircuit, ListPlus, Play } from "lucide-react";

import { Button } from "@/components/ui/button";

type Action = "enqueue" | "process";

export function GrantIntelligenceActions() {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runAction = (action: Action) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/grant-intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Grant intelligence action failed.");
        if (action === "enqueue") {
          setMessage(`Queued ${payload.enqueued ?? 0} grants from ${payload.requested ?? 0} scanned.`);
        } else {
          setMessage(`Processed ${payload.processed ?? 0}: ${payload.completed ?? 0} completed, ${payload.skipped ?? 0} skipped, ${payload.failed ?? 0} failed.`);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Grant intelligence action failed.");
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => runAction("enqueue")}>
          <ListPlus className="mr-2 h-4 w-4" />
          Queue grants
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={() => runAction("process")}>
          <Play className="mr-2 h-4 w-4" />
          Process batch
        </Button>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BrainCircuit className="h-3.5 w-3.5" />
        Extracts reusable grant criteria once, then all profiles can match against it.
      </div>
      {message && (
        <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
          {message}
        </div>
      )}
    </div>
  );
}
