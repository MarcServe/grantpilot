"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

interface DiscoverGrantsButtonProps {
  disabled?: boolean;
  className?: string;
}

export function DiscoverGrantsButton({ disabled, className }: DiscoverGrantsButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDiscover() {
    setLoading(true);
    try {
      const res = await fetch("/api/grants/discover", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Discovery failed");
        return;
      }
      const { claude, openai, gemini, created, updated } = data;
      const total = (created ?? 0) + (updated ?? 0);
      if (total > 0) {
        toast.success(
          `Found ${claude ?? 0} (Claude) + ${openai ?? 0} (OpenAI) + ${gemini ?? 0} (Gemini). ${created ?? 0} new, ${updated ?? 0} updated.`
        );
        router.refresh();
      } else {
        toast.success(
          `Discovery ran (Claude: ${claude ?? 0}, OpenAI: ${openai ?? 0}, Gemini: ${gemini ?? 0}). No new grants this time.`
        );
      }
    } catch {
      toast.error("Discovery request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDiscover}
      disabled={disabled || loading}
      className={className}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Search className="mr-2 h-4 w-4" />
      )}
      Find grants (GrantsCopilot)
    </Button>
  );
}
