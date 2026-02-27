"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { GrantMatch } from "@/lib/claude";

interface MatchButtonProps {
  onMatches: (matches: GrantMatch[]) => void;
  disabled: boolean;
}

export function MatchButton({ onMatches, disabled }: MatchButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleMatch() {
    setLoading(true);
    try {
      const res = await fetch("/api/grants/match", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to match grants");
        return;
      }

      onMatches(data.matches);
      toast.success("Grants matched successfully");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleMatch} disabled={loading || disabled} className="gap-2">
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {loading ? "Matching..." : "AI Match Grants"}
    </Button>
  );
}
