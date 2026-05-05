"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { normalizeGrantApplicationUrl } from "@/lib/grant-url";

interface ApplyByLinkFormProps {
  profileId: string;
  prefillUrl?: string;
  prefillGrantName?: string;
  prefillFunder?: string;
  fixGrantId?: string;
}

export function ApplyByLinkForm({ prefillUrl, prefillGrantName, prefillFunder }: ApplyByLinkFormProps) {
  const [urlInput, setUrlInput] = useState(prefillUrl ?? "");
  const [grantName, setGrantName] = useState(prefillGrantName ?? "");
  const [funder, setFunder] = useState(prefillFunder ?? "");
  const [eligibility, setEligibility] = useState("");
  const [focusNotes, setFocusNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lines = urlInput
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const urls: string[] = [];
    let invalidCount = 0;
    for (const line of lines) {
      const normalized = normalizeGrantApplicationUrl(line);
      if (normalized) urls.push(normalized);
      else invalidCount += 1;
    }
    if (lines.length === 0) {
      toast.error("Please enter at least one grant application URL");
      return;
    }
    if (invalidCount > 0) {
      toast.error(
        `${invalidCount} invalid URL(s). Enter one full URL per line — you can omit https:// and we will add it (e.g. www.example.gov/apply).`
      );
      return;
    }
    if (urls.length > 20) {
      toast.error("Maximum 20 URLs per batch. Add fewer and try again.");
      return;
    }
    if (urls.length > 1) {
      toast.info("Batch auto-filing is moving to Version 2. Open one funder link at a time for now.");
      return;
    }
    toast.success("Link verified. Opening the official funder page.");
    window.open(urls[0], "_blank", "noopener,noreferrer");
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
              placeholder={"https://www.example.gov/apply\nwww.another-funder.org/forms/2025 (https:// optional)"}
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
          <div>
            <Label htmlFor="focusNotes">Focus notes for AI <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <textarea
              id="focusNotes"
              placeholder="e.g. Emphasise our sustainability work and community partnerships. Mention our NHS pilot results."
              value={focusNotes}
              onChange={(e) => setFocusNotes(e.target.value)}
              className="mt-1 w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={2000}
            />
          <p className="mt-1 text-xs text-muted-foreground">
              Keep these notes for your manual application and Founder Pack drafting. Auto-filing is moving to Version 2.
            </p>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Version 1 verifies and prepares grant applications. Automatic external form filling is a Version 2 feature
            while we harden support for login portals, CAPTCHAs, dynamic fields, and funder-specific forms.
          </div>
          <Button type="submit" className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Verify link and open funder form
          </Button>
          <Link href="/founder-pack" className="ml-0 inline-flex text-sm font-medium text-primary underline sm:ml-3">
            Generate Founder & SME Pack
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
