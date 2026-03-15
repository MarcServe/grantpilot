"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";

interface StartApplicationFormProps {
  token: string;
  grantName: string;
}

export function StartApplicationForm({ token, grantName }: StartApplicationFormProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const autoStarted = useRef(false);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/applications/start-by-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.applicationId) {
          setApplicationId(data.applicationId);
          setDone(true);
        } else {
          setError(data.error ?? "Failed to start application");
        }
        return;
      }
      setApplicationId(data.applicationId);
      setDone(true);
      if (data.applicationId) {
        router.push(`/applications/${data.applicationId}`);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoStarted.current || loading || done) return;
    autoStarted.current = true;
    handleStart();
  }, []);

  if (done) {
    return (
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <CheckCircle className="mx-auto h-10 w-10 text-green-600" />
        <p className="mt-2 font-medium text-green-800">Application started</p>
        <p className="mt-1 text-sm text-green-700">
          Your application for {grantName} has been created. GrantsCopilot is filling it in.
        </p>
        {applicationId && (
          <Button className="mt-4" onClick={() => router.push(`/applications/${applicationId}`)}>
            View application
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <Button
        onClick={handleStart}
        disabled={loading}
        className="w-full gap-2"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle className="h-4 w-4" />
        )}
        {loading ? "Starting…" : "Apply with GrantsCopilot"}
      </Button>
      {error && (
        <p className="text-center text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
