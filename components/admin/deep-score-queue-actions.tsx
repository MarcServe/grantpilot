"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Brain, Loader2, Play, Rows3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DeepScoreQueueActions() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function run(action: "enqueue_backlog" | "process_batch") {
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
      toast.success(
        action === "enqueue_backlog"
          ? `Backlog queued: ${String(result?.enqueued ?? 0)} rows`
          : `Processed: ${String(result?.completed ?? 0)} completed`
      );
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Queue action failed");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => void run("enqueue_backlog")}>
        {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Rows3 className="mr-1 h-3 w-3" />}
        Queue backlog
      </Button>
      <Button size="sm" disabled={isPending} onClick={() => void run("process_batch")}>
        {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
        Process 50
      </Button>
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Brain className="h-3 w-3" />
        Uses full company-DNA scoring.
      </span>
    </div>
  );
}
