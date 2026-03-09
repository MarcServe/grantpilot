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
      toast.error("Please confirm you have reviewed the application.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/applications/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, confirmed: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Submission failed");
        return;
      }

      toast.success("Application submitted successfully!");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle>Ready to Submit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The AI has completed filling in your application. Please review all the
          information above carefully before submitting.
        </p>

        <div className="flex items-start gap-3">
          <Checkbox
            id="confirm"
            checked={checked}
            onCheckedChange={(value) => setChecked(value === true)}
          />
          <label htmlFor="confirm" className="text-sm leading-relaxed">
            I have reviewed this application and confirm that all information is
            accurate. I authorise Grants-Copilot to submit this application on my
            behalf.
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
          Submit Application
        </Button>
      </CardContent>
    </Card>
  );
}
