"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  id: string;
  kind: "source_candidate" | "application_link" | string;
  endpoint?: string | null;
};

export function ReviewQueueActions({ id, kind, endpoint }: Props) {
  const [isPending, setIsPending] = useState(false);
  const [url, setUrl] = useState(endpoint ?? "");
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);

  async function run(action: "approve_source" | "approve_application_link" | "reject") {
    setIsPending(true);
    setCompletedMessage(null);
    try {
      const res = await fetch("/api/admin/review-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          endpoint: action === "reject" ? undefined : url,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Review action failed");
      const message = (data as { message?: string }).message ?? "Review action completed";
      setCompletedMessage(message);
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review action failed");
    } finally {
      setIsPending(false);
    }
  }

  const approvingSource = kind === "source_candidate";
  const approvingLink = kind === "application_link";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={approvingLink ? "Direct form or official portal start URL" : "Source URL"}
          className="h-8 min-w-0 text-xs"
        />
        {url.trim() ? (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <a href={url.trim()} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3 w-3" />
              Open
            </a>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {approvingSource && !completedMessage && (
          <Button size="sm" disabled={isPending} onClick={() => void run("approve_source")}>
            {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Approve source
          </Button>
        )}
        {approvingLink && !completedMessage && (
          <Button size="sm" disabled={isPending} onClick={() => void run("approve_application_link")}>
            {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Approve link
          </Button>
        )}
        {!completedMessage && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => void run("reject")}>
            Reject
          </Button>
        )}
      </div>
      {completedMessage ? (
        <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
          {completedMessage}
        </div>
      ) : null}
    </div>
  );
}
