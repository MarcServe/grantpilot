"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  id: string;
  kind: "source_candidate" | "application_link" | string;
  endpoint?: string | null;
};

export function ReviewQueueActions({ id, kind, endpoint }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState(endpoint ?? "");

  async function run(action: "approve_source" | "approve_application_link" | "reject") {
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
      toast.success((data as { message?: string }).message ?? "Review action completed");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review action failed");
    }
  }

  const approvingSource = kind === "source_candidate";
  const approvingLink = kind === "application_link";

  return (
    <div className="mt-3 space-y-2">
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder={approvingLink ? "Application form URL" : "Source URL"}
        className="h-8 text-xs"
      />
      <div className="flex flex-wrap gap-2">
        {approvingSource && (
          <Button size="sm" disabled={isPending} onClick={() => void run("approve_source")}>
            {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Approve source
          </Button>
        )}
        {approvingLink && (
          <Button size="sm" disabled={isPending} onClick={() => void run("approve_application_link")}>
            {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Approve link
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => void run("reject")}>
          Reject
        </Button>
      </div>
    </div>
  );
}
