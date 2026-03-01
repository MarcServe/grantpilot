"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";

export function ApplyByLinkForm({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [applicationUrl, setApplicationUrl] = useState("");
  const [grantName, setGrantName] = useState("");
  const [funder, setFunder] = useState("");
  const [eligibility, setEligibility] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = applicationUrl.trim();
    if (!url) {
      toast.error("Please enter the grant application URL");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/applications/start-with-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationUrl: url,
          profileId,
          grantName: grantName.trim() || undefined,
          funder: funder.trim() || undefined,
          eligibility: eligibility.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to start application");
        return;
      }
      toast.success("Application started. AI is filling the form.");
      router.push(`/applications/${data.applicationId}`);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" />
          Grant application URL
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="applicationUrl">Application URL *</Label>
            <Input
              id="applicationUrl"
              type="url"
              placeholder="https://..."
              value={applicationUrl}
              onChange={(e) => setApplicationUrl(e.target.value)}
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor="grantName">Grant name (optional)</Label>
            <Input
              id="grantName"
              placeholder="e.g. Innovation Grant 2025"
              value={grantName}
              onChange={(e) => setGrantName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="funder">Funder (optional)</Label>
            <Input
              id="funder"
              placeholder="e.g. UK Government"
              value={funder}
              onChange={(e) => setFunder(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="eligibility">Eligibility / notes (optional)</Label>
            <textarea
              id="eligibility"
              placeholder="Paste key eligibility criteria or notes to help our AI map your profile."
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
              className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={5000}
            />
          </div>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Start auto-fill
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
