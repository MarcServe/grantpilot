"use client";

import { useState } from "react";
import { Brain, Loader2, Play, Rows3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DeepScoreQueueActions() {
  const [busyAction, setBusyAction] = useState<"enqueue_backlog" | "process_batch" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: "enqueue_backlog" | "process_batch") {
    setBusyAction(action);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/deep-score-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          limit: action === "enqueue_backlog" ? 500 : 50,
          minScore: 40,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Queue action failed");
      const result = (data as { result?: Record<string, unknown> }).result;
      const successMessage =
        action === "enqueue_backlog"
          ? `Backlog queued: ${String(result?.enqueued ?? 0)} rows from ${String(result?.scanned ?? 0)} scanned`
          : `Processed: ${String(result?.completed ?? 0)} completed, ${String(result?.skipped ?? 0)} skipped, ${String(result?.failed ?? 0)} failed`;
      setMessage(successMessage);
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Queue action failed");
    } finally {
      setBusyAction(null);
    }
  }

  const busy = busyAction != null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("enqueue_backlog")}>
          {busyAction === "enqueue_backlog" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Rows3 className="mr-1 h-3 w-3" />}
          Queue backlog
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void run("process_batch")}>
          {busyAction === "process_batch" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
          Process 50
        </Button>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Brain className="h-3 w-3" />
          Uses full company-DNA scoring.
        </span>
      </div>
      {message ? (
        <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
          {message}
        </div>
      ) : null}
    </div>
  );
}
