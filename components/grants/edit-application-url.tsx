"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, Pencil, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

/** Heuristic: programme/info page (e.g. technation.io/programmes/climate/) vs form (airtable, typeform). */
function isLikelyProgrammePage(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h.includes("airtable.com") || h.includes("typeform.com") || h.includes("forms.gle")) return false;
    const path = u.pathname.toLowerCase();
    return path.includes("/programme") || path.includes("/programmes/") || path.includes("/opportunit") || path.includes("/funding/") || path.includes("/grants/");
  } catch {
    return false;
  }
}

interface EditApplicationUrlProps {
  grantId: string;
  applicationUrl: string;
}

export function EditApplicationUrl({ grantId, applicationUrl }: EditApplicationUrlProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(applicationUrl);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const showFindForm = isLikelyProgrammePage(applicationUrl);

  useEffect(() => {
    setValue(applicationUrl);
  }, [applicationUrl]);

  const handleSave = async () => {
    const url = value.trim();
    if (!url) {
      toast.error("Please enter a URL");
      return;
    }
    try {
      new URL(url);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/grants/${grantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationUrl: url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? res.statusText);
      }
      setEditing(false);
      toast.success("Application URL updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <Label htmlFor="application-url-edit">Application URL</Label>
        <div className="flex gap-2">
          <Input
            id="application-url-edit"
            type="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://..."
            className="font-mono text-sm"
          />
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setValue(applicationUrl);
              setEditing(false);
            }}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const handleFindForm = async () => {
    setDiscovering(true);
    try {
      const res = await fetch(`/api/grants/${grantId}/scout-form-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to start discovery");
        return;
      }
      if (data.status === "skipped") {
        toast.info(data.message ?? "No Scout needed for this URL.");
        return;
      }
      if (data.status === "found" && data.formUrl) {
        setValue(data.formUrl);
        setEditing(true);
        router.refresh();
        toast.success("Application form link found. Review and save to use it for auto-fill.");
        return;
      }
      if (data.status === "running") {
        toast.info(data.message ?? "Discovery already in progress.");
        return;
      }
      // status === "pending": poll until terminal or timeout
      const maxWaitMs = 120_000;
      const pollIntervalMs = 3000;
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        const pollRes = await fetch(`/api/grants/${grantId}/scout-form-link`);
        const pollData = await pollRes.json();
        if (!pollRes.ok) {
          toast.error(pollData.error ?? "Poll failed");
          return;
        }
        if (pollData.status === "found" && pollData.formUrl) {
          setValue(pollData.formUrl);
          setEditing(true);
          router.refresh();
          toast.success("Application form link found. Review and save to use it for auto-fill.");
          return;
        }
        if (pollData.status === "failed" || pollData.status === "manual_review_needed") {
          toast.info(
            pollData.status === "failed"
              ? pollData.error ?? "Discovery failed. Try editing the URL manually."
              : "No application form link identified. Edit the URL manually if you know the form link."
          );
          return;
        }
      }
      toast.info("Discovery is taking longer than expected. The worker may still update the link—refresh the page later.");
    } catch {
      toast.error("Failed to discover form link");
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={applicationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary underline hover:no-underline"
        >
          <ExternalLink className="h-3 w-3" />
          {applicationUrl.length > 50 ? `${applicationUrl.slice(0, 50)}…` : applicationUrl}
        </a>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-muted-foreground"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3 w-3" />
          Edit URL
        </Button>
        {showFindForm && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={handleFindForm}
            disabled={discovering}
          >
            {discovering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            Find application form
          </Button>
        )}
      </div>
      {showFindForm && (
        <p className="text-xs text-muted-foreground">
          This link looks like a programme info page. Use &quot;Find application form&quot; to open the page in a browser (Playwright) and find the direct form URL like a human would. The worker must be running for discovery to complete.
        </p>
      )}
    </div>
  );
}
