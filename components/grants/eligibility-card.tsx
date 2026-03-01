"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Scale, CheckCircle, AlertCircle, XCircle } from "lucide-react";

interface EligibilityResult {
  decision: "likely_eligible" | "review" | "unlikely";
  reason: string;
  confidence: number;
}

export function EligibilityCard({ grantId }: { grantId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/grants/${grantId}/eligibility`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to check eligibility");
        return;
      }
      setResult(data);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const decisionConfig = {
    likely_eligible: { label: "Likely eligible", icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
    review: { label: "Review", icon: AlertCircle, color: "text-amber-600 bg-amber-50 border-amber-200" },
    unlikely: { label: "Unlikely", icon: XCircle, color: "text-red-600 bg-red-50 border-red-200" },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Scale className="h-4 w-4" />
          Eligibility decision
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!result ? (
          <>
            <p className="text-sm text-muted-foreground">
              Get an AI assessment of how well your business fits this grant.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheck}
              disabled={loading}
              className="gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Check eligibility
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={result.decision === "likely_eligible" ? "default" : "secondary"}
                className={result.decision === "unlikely" ? "border-red-200 bg-red-50 text-red-700" : result.decision === "review" ? "border-amber-200 bg-amber-50 text-amber-700" : ""}
              >
                {result.decision.replace(/_/g, " ")}
              </Badge>
              {result.confidence > 0 && (
                <span className="text-xs text-muted-foreground">
                  Confidence: {result.confidence}%
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed">{result.reason}</p>
            <Button variant="ghost" size="sm" onClick={handleCheck} disabled={loading}>
              {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Re-check
            </Button>
          </>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
