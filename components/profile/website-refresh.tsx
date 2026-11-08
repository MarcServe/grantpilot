"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function WebsiteRefresh({ profileId, websiteUrl, savedWebsiteUrl, disabled }: { profileId?: string; websiteUrl: string; savedWebsiteUrl: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [result, setResult] = useState<{ summary: string; refreshedAt: string } | null>(null);
  const changed = websiteUrl.trim() !== savedWebsiteUrl.trim();
  async function refresh() {
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/profile/analyse-website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId, websiteUrl: savedWebsiteUrl }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not refresh the website. Please retry.");
      setResult(body); window.dispatchEvent(new CustomEvent("profile:website-refreshed", { detail: { profileId: body.profileId } }));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not refresh the website."); }
    finally { setBusy(false); }
  }
  return <div className="min-w-0 space-y-2 rounded-md border bg-muted/20 p-3">
    <Button type="button" variant="outline" disabled={busy || disabled || !websiteUrl.trim() || changed} onClick={refresh}>{busy ? "Reading the latest website…" : "Re-scrape website"}</Button>
    <p className="text-xs text-muted-foreground">Fetch fresh information from the saved public page. Confirmed profile fields stay unchanged until you review and apply suggestions.</p>
    {changed && <p className="text-xs text-amber-900">Save the changed website address with Save &amp; Next first, then re-scrape.</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {result && <div className="space-y-2 text-sm"><p role="status">Website context updated · {new Date(result.refreshedAt).toLocaleString("en-GB")}</p><details><summary className="cursor-pointer">Review updated business context</summary><p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-xs">{result.summary}</p></details><a className="underline" href="#business-dna-generator">Generate and review updated profile suggestions</a><p className="text-xs">Read the summary before using it. This refresh covers the saved public page, not the whole site.</p></div>}
  </div>;
}
