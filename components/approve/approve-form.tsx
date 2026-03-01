"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";

interface ApproveFormProps {
  applicationId: string;
  token: string;
  grantName: string;
}

export function ApproveForm({ applicationId, token, grantName }: ApproveFormProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/applications/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Approval failed");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <CheckCircle className="mx-auto h-10 w-10 text-green-600" />
        <p className="mt-2 font-medium text-green-800">Application approved</p>
        <p className="mt-1 text-sm text-green-700">
          You can now sign in and submit when ready, or do it from the app.
        </p>
        <Button asChild className="mt-4">
          <a href="/sign-in">Sign in to GrantPilot</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <Button
        onClick={handleApprove}
        disabled={loading}
        className="w-full gap-2"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle className="h-4 w-4" />
        )}
        {loading ? "Approving…" : "Approve application"}
      </Button>
      {error && (
        <p className="text-center text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
