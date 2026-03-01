"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StopCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function StopApplicationButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStop() {
    if (!confirm("Stop this application? The AI will no longer process it.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to stop application");
        return;
      }
      toast.success("Application stopped.");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleStop}
      disabled={loading}
      className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
      Stop application
    </Button>
  );
}
