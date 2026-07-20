"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

function normaliseSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type CommunityCode = {
  id: string;
  partnerName: string;
  slug: string;
  accessPlan: string;
  durationDays: number;
  maxRedemptions: number;
  redeemBy: string | null;
  active: boolean;
  createdAt: string | null;
  redemptions: number;
  activeMembers: number;
  expiredMembers: number;
  remaining: number;
};

function defaultRedeemBy(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 6);
  return date.toISOString().slice(0, 10);
}

function formatDate(value?: string | null): string {
  if (!value) return "No redeem-by date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No redeem-by date";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function CommunityAccessManager() {
  const [codes, setCodes] = useState<CommunityCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    partnerName: "",
    slug: "",
    durationDays: 90,
    maxRedemptions: 250,
    redeemBy: defaultRedeemBy(),
  });

  const launchSpaceExists = useMemo(() => codes.some((code) => code.slug === "launchspace" && code.active), [codes]);
  const futureSpaceExists = useMemo(() => codes.some((code) => code.slug === "future-space" && code.active), [codes]);

  async function loadCodes() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/community-access", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Could not load community access codes");
        return;
      }
      setCodes(data.codes ?? []);
    } catch {
      toast.error("Could not load community access codes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCodes();
  }, []);

  async function createCode(overrides?: Partial<typeof form>) {
    const payload = { ...form, ...overrides, accessPlan: "GROWTH" };
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/community-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Could not create community link");
        return;
      }
      setCodes(data.codes ?? []);
      setLastUrl(data.url ?? null);
      toast.success("Community pilot link created");
    } catch {
      toast.error("Could not create community link");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(code: CommunityCode) {
    try {
      const response = await fetch(`/api/admin/community-access/${encodeURIComponent(code.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !code.active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Could not update community link");
        return;
      }
      toast.success(code.active ? "Community link deactivated" : "Community link activated");
      await loadCodes();
    } catch {
      toast.error("Could not update community link");
    }
  }

  async function rotateLink(code: CommunityCode) {
    try {
      const response = await fetch(`/api/admin/community-access/${encodeURIComponent(code.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotateToken: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Could not generate replacement link");
        return;
      }
      setLastUrl(data.url ?? null);
      toast.success("Replacement community link generated");
      await loadCodes();
    } catch {
      toast.error("Could not generate replacement link");
    }
  }

  async function copyLastUrl() {
    if (!lastUrl) return;
    await navigator.clipboard.writeText(lastUrl);
    toast.success("Community link copied");
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-blue-600" />
          Community pilot access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Create shareable pilot links for any partner community. LaunchSpace and Future Space are just presets.
          Tokens are stored hashed, so copy the generated link when it appears.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="community-partner">Partner</Label>
            <Input
              id="community-partner"
              placeholder="LaunchSpace, Future Space, Barclays Eagle Labs..."
              value={form.partnerName}
              onChange={(event) =>
                setForm((current) => {
                  const previousDerivedSlug = normaliseSlug(current.partnerName);
                  const nextPartnerName = event.target.value;
                  const shouldSyncSlug = !current.slug || current.slug === previousDerivedSlug;
                  return {
                    ...current,
                    partnerName: nextPartnerName,
                    slug: shouldSyncSlug ? normaliseSlug(nextPartnerName) : current.slug,
                  };
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="community-slug">Slug</Label>
            <Input
              id="community-slug"
              placeholder="partner-url-slug"
              value={form.slug}
              onChange={(event) => setForm((current) => ({ ...current, slug: normaliseSlug(event.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="community-duration">Duration days</Label>
            <Input
              id="community-duration"
              type="number"
              min={1}
              max={365}
              value={form.durationDays}
              onChange={(event) => setForm((current) => ({ ...current, durationDays: Number(event.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="community-cap">Max redemptions</Label>
            <Input
              id="community-cap"
              type="number"
              min={1}
              value={form.maxRedemptions}
              onChange={(event) => setForm((current) => ({ ...current, maxRedemptions: Number(event.target.value) }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="community-redeem-by">Redeem by</Label>
            <Input
              id="community-redeem-by"
              type="date"
              value={form.redeemBy}
              onChange={(event) => setForm((current) => ({ ...current, redeemBy: event.target.value }))}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => createCode()} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create link
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting || launchSpaceExists}
            onClick={() => createCode({ partnerName: "LaunchSpace", slug: "launchspace" })}
          >
            LaunchSpace default
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting || futureSpaceExists}
            onClick={() => createCode({ partnerName: "Future Space", slug: "future-space" })}
          >
            Future Space default
          </Button>
          <Button type="button" variant="ghost" onClick={loadCodes} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
        {lastUrl && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <div className="mb-2 font-medium text-emerald-950">Generated link</div>
            <div className="break-all text-xs text-emerald-900">{lastUrl}</div>
            <Button type="button" size="sm" className="mt-3" onClick={copyLastUrl}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {loading ? (
            <p className="text-muted-foreground">Loading community links...</p>
          ) : codes.length > 0 ? (
            codes.map((code) => (
              <div key={code.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{code.partnerName}</div>
                    <div className="text-xs text-muted-foreground">
                      /community/{code.slug} · {code.durationDays} days · redeem by {formatDate(code.redeemBy)}
                    </div>
                  </div>
                  <Badge variant={code.active ? "default" : "secondary"}>{code.active ? "Active" : "Inactive"}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Redeemed</div>
                    <div className="text-lg font-semibold">{code.redemptions}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Active</div>
                    <div className="text-lg font-semibold text-emerald-700">{code.activeMembers}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Expired</div>
                    <div className="text-lg font-semibold">{code.expiredMembers}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Remaining</div>
                    <div className="text-lg font-semibold">{code.remaining}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => toggleActive(code)}>
                    {code.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => rotateLink(code)}>
                    Generate replacement link
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No community access links created yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
