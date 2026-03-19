"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Bell } from "lucide-react";
import { toast } from "sonner";

export function EligibilityNotificationPreferences() {
  const [minScore, setMinScore] = useState(0);
  const [maxScore, setMaxScore] = useState(100);
  const [eligibleThreshold, setEligibleThreshold] = useState(70);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile/eligibility-preferences")
      .then((res) => res.json())
      .then((data) => {
        if (data.minScore != null) setMinScore(data.minScore);
        if (data.maxScore != null) setMaxScore(data.maxScore);
        if (data.eligibleThreshold != null) setEligibleThreshold(data.eligibleThreshold);
        if (data.notifyEmail != null) setNotifyEmail(data.notifyEmail);
        if (data.notifyInApp != null) setNotifyInApp(data.notifyInApp);
        if (data.notifyWhatsApp != null) setNotifyWhatsApp(data.notifyWhatsApp);
      })
      .catch(() => toast.error("Failed to load preferences"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (maxScore < minScore) {
      toast.error("Max score must be at least min score");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile/eligibility-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minScore: Number(minScore),
          maxScore: Number(maxScore),
          eligibleThreshold: Number(eligibleThreshold),
          notifyEmail,
          notifyInApp,
          notifyWhatsApp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Eligibility notification preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-5 w-5" />
          Eligibility notification range
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Notify me when a grant&apos;s eligibility score falls in this range (e.g. 70–85% or 85–100%). Within-reach grants (below eligible threshold) are email only; eligible grants get email + WhatsApp when enabled.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="minScore" className="text-sm">Min %</Label>
            <Input
              id="minScore"
              type="number"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-20"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="maxScore" className="text-sm">Max %</Label>
            <Input
              id="maxScore"
              type="number"
              min={0}
              max={100}
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
              className="w-20"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="eligibleThreshold" className="text-sm" title="Grants at or above this score get WhatsApp + email; below get email only">Eligible from %</Label>
            <Input
              id="eligibleThreshold"
              type="number"
              min={0}
              max={100}
              value={eligibleThreshold}
              onChange={(e) => setEligibleThreshold(Number(e.target.value))}
              className="w-20"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Checkbox id="notifyEmail" checked={notifyEmail} onCheckedChange={(c) => setNotifyEmail(c === true)} />
            <Label htmlFor="notifyEmail" className="text-sm font-normal cursor-pointer">Email</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="notifyInApp" checked={notifyInApp} onCheckedChange={(c) => setNotifyInApp(c === true)} />
            <Label htmlFor="notifyInApp" className="text-sm font-normal cursor-pointer">In-app</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="notifyWhatsApp" checked={notifyWhatsApp} onCheckedChange={(c) => setNotifyWhatsApp(c === true)} />
            <Label htmlFor="notifyWhatsApp" className="text-sm font-normal cursor-pointer">WhatsApp</Label>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
