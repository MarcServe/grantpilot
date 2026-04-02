"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Radar } from "lucide-react";
import { toast } from "sonner";

type ScoutMode = "off" | "regex" | "full";

interface GetResponse {
  stored: ScoutMode | null;
  envFallback: ScoutMode;
  effective: ScoutMode;
  hasDatabaseOverride: boolean;
  description: Record<ScoutMode, string>;
}

export function ScoutModeSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<GetResponse | null>(null);
  const [selected, setSelected] = useState<ScoutMode>("regex");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/scout-mode");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to load");
      }
      const json = (await res.json()) as GetResponse;
      setData(json);
      setSelected(json.effective);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load scout settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(mode: ScoutMode) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/scout-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? "Save failed");
      }
      toast.success((json as { message?: string }).message ?? "Saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/scout-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? "Failed");
      }
      toast.success((json as { message?: string }).message ?? "Cleared");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-4 w-4" />
            Grant form URL scout (worker)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </CardContent>
      </Card>
    );
  }

  const modes: { value: ScoutMode; label: string }[] = [
    { value: "off", label: "Off — no scouting" },
    { value: "regex", label: "Regex only — Playwright + heuristics (no Gemini)" },
    { value: "full", label: "Full — regex + Gemini Flash when needed" },
  ];

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="h-4 w-4" />
          Grant form URL scout (worker)
        </CardTitle>
        <CardDescription>
          Controls how the Fly.io worker discovers real application URLs from programme pages. The
          database setting overrides <code className="rounded bg-muted px-1">SCOUT_MODE</code> on the
          worker; clear the override to use the env value only. URL health checks (HTTP) on the web
          app are separate and do not use Gemini.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p>
            <span className="text-muted-foreground">Effective mode:</span>{" "}
            <strong className="text-foreground">{data.effective}</strong>
            {data.hasDatabaseOverride ? (
              <span className="text-muted-foreground"> (stored in database)</span>
            ) : (
              <span className="text-muted-foreground">
                {" "}
                (from worker env, default <code className="rounded bg-muted px-1">{data.envFallback}</code>)
              </span>
            )}
          </p>
        </div>

        <div className="space-y-3">
          {modes.map(({ value, label }) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="scoutMode"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">{label}</div>
                <p className="text-xs text-muted-foreground">{data.description[value]}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={saving} onClick={() => void save(selected)} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save scout mode
          </Button>
          {data.hasDatabaseOverride && (
            <Button type="button" variant="outline" disabled={saving} onClick={() => void clearOverride()}>
              Use env only (clear DB override)
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
