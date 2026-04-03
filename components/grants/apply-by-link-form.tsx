"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Link2, Zap } from "lucide-react";
import { toast } from "sonner";

function isValidUrl(s: string): boolean {
  try {
    new URL(s.trim());
    return true;
  } catch {
    return false;
  }
}

interface ApplyByLinkFormProps {
  profileId: string;
  prefillUrl?: string;
  prefillGrantName?: string;
  prefillFunder?: string;
  fixGrantId?: string;
}

export function ApplyByLinkForm({ profileId, prefillUrl, prefillGrantName, prefillFunder, fixGrantId }: ApplyByLinkFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState(prefillUrl ?? "");
  const [grantName, setGrantName] = useState(prefillGrantName ?? "");
  const [funder, setFunder] = useState(prefillFunder ?? "");
  const [eligibility, setEligibility] = useState("");
  const [autopilot, setAutopilot] = useState(false);
  const [successApplications, setSuccessApplications] = useState<{ applicationId: string; grantName: string }[] | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lines = urlInput
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const urls = lines.filter(isValidUrl);
    const invalidCount = lines.length - urls.length;
    if (lines.length === 0) {
      toast.error("Please enter at least one grant application URL");
      return;
    }
    if (invalidCount > 0) {
      toast.error(`${invalidCount} invalid URL(s). Enter one URL per line (e.g. https://...).`);
      return;
    }
    if (urls.length > 20) {
      toast.error("Maximum 20 URLs per batch. Add fewer and try again.");
      return;
    }
    setLoading(true);
    setSuccessApplications(null);
    try {
      const body: {
        profileId: string;
        autopilot?: boolean;
        applicationUrl?: string;
        grantName?: string;
        funder?: string;
        eligibility?: string;
        fixGrantId?: string;
        links?: { applicationUrl: string; grantName?: string; funder?: string; eligibility?: string }[];
      } = {
        profileId,
        autopilot: autopilot || undefined,
        fixGrantId: fixGrantId || undefined,
      };
      const shared = {
        grantName: grantName.trim() || undefined,
        funder: funder.trim() || undefined,
        eligibility: eligibility.trim() || undefined,
      };
      if (urls.length === 1) {
        body.applicationUrl = urls[0];
        body.grantName = shared.grantName;
        body.funder = shared.funder;
        body.eligibility = shared.eligibility;
      } else {
        body.links = urls.map((applicationUrl) => ({ applicationUrl, ...shared }));
      }
      const res = await fetch("/api/applications/start-with-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to start application(s)");
        return;
      }
      const apps = data.applications as { applicationId: string; grantName: string }[] | undefined;
      if (apps && apps.length > 0) {
        setSuccessApplications(apps);
        if (apps.length === 1) {
          toast.success(autopilot ? "Application started. AI will fill and submit." : "Application started. AI is filling the form.");
          router.push(`/applications/${apps[0].applicationId}`);
          return;
        }
        toast.success(`${apps.length} applications started. AI is filling the forms.`);
      } else {
        toast.success("Application started. AI is filling the form.");
        router.push(`/applications/${data.applicationId}`);
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (successApplications && successApplications.length > 1) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">Batch started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {successApplications.length} applications are being filled. Open any to track progress.
          </p>
          <ul className="space-y-2">
            {successApplications.map(({ applicationId, grantName: name }) => (
              <li key={applicationId}>
                <Link
                  href={`/applications/${applicationId}`}
                  className="text-sm font-medium text-primary underline"
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
          <Button variant="outline" onClick={() => { setSuccessApplications(null); setUrlInput(""); }}>
            Add more links
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" />
          Grant application URL(s)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="urlInput">Application URL(s) * — one per line (max 20)</Label>
            <textarea
              id="urlInput"
              placeholder={"https://...\nhttps://..."}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="mt-1 w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
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
          <div className="flex items-center gap-2">
            <Checkbox
              id="autopilot"
              checked={autopilot}
              onCheckedChange={(c) => setAutopilot(c === true)}
            />
            <Label htmlFor="autopilot" className="flex items-center gap-1.5 cursor-pointer font-normal">
              <Zap className="h-4 w-4 text-amber-500" />
              Autopilot: submit without asking for approval
            </Label>
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
