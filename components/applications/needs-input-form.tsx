"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

export interface NeedsInputField {
  selector: string;
  label: string;
  hint?: string;
}

interface NeedsInputFormProps {
  applicationId: string;
  needsInput: NeedsInputField[];
}

export function NeedsInputForm({ applicationId, needsInput }: NeedsInputFormProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit-needs-input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to submit");
        return;
      }
      toast.success("Details saved. The AI will continue filling your application.");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (needsInput.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="text-amber-900">We need a few details</CardTitle>
        <p className="text-sm text-amber-800">
          The grant form requires some information we don&apos;t have in your profile. Fill in the fields below and click Resume so our AI can continue.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {needsInput.map((field) => (
            <div key={field.selector} className="space-y-2">
              <Label htmlFor={`need-${field.selector}`} className="text-amber-900">
                {field.label}
              </Label>
              {field.hint && (
                <p className="text-xs text-amber-700">{field.hint}</p>
              )}
              <Input
                id={`need-${field.selector}`}
                type="text"
                value={answers[field.label] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [field.label]: e.target.value }))
                }
                className="bg-white border-amber-200"
                placeholder={`Enter ${field.label.toLowerCase()}`}
              />
            </div>
          ))}
          <Button type="submit" disabled={submitting} className="gap-2">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {submitting ? "Saving…" : "Submit & Resume"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
