"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

interface SubmitSectionProps {
  applicationId: string;
}

export function SubmitSection({ applicationId }: SubmitSectionProps) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    if (!checked) {
      toast.error("Please confirm the funder application has been sent.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/mark-submitted`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Submission failed");
        return;
      }

      toast.success("Application marked as submitted");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card id="application-submit" className="scroll-mt-24 border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle>Mark Submitted</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Submit the application on the official funder website or portal. After it has been sent, mark it submitted
          here so GrantPilot stops sending repeat eligibility prompts and starts outcome tracking.
        </p>

        <div className="flex items-start gap-3">
          <Checkbox
            id="confirm"
            checked={checked}
            onCheckedChange={(value) => setChecked(value === true)}
          />
          <label htmlFor="confirm" className="text-sm leading-relaxed">
            I have submitted this application to the funder, or I am recording that it has been sent outside GrantPilot.
          </label>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!checked || loading}
          className="w-full gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Mark as submitted
        </Button>
      </CardContent>
    </Card>
  );
}
