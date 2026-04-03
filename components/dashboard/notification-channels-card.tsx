"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { updateOrganisationTimezone } from "@/app/(dashboard)/settings/actions";
import { VALID_TIMEZONES } from "@/lib/timezone";

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TZ_LABELS: Record<string, string> = {
  UTC: "UTC",
  "Europe/London": "UK (London)",
  "Europe/Paris": "Europe (Paris)",
  "Europe/Berlin": "Europe (Berlin)",
  "America/New_York": "US East (New York)",
  "America/Los_Angeles": "US West (Los Angeles)",
  "America/Chicago": "US Central (Chicago)",
  "Asia/Dubai": "UAE (Dubai)",
  "Asia/Kolkata": "India (Mumbai)",
  "Australia/Sydney": "Australia (Sydney)",
};

interface DashboardNotificationChannelsProps {
  initialWhatsappOptIn: boolean;
  initialHasPhone: boolean;
  preferredTimezone: string | null;
  lastEligibilityRun: string | null;
  eligibilityGrantCount: number;
}

export function DashboardNotificationChannels({
  initialWhatsappOptIn,
  initialHasPhone,
  preferredTimezone,
  lastEligibilityRun,
  eligibilityGrantCount,
}: DashboardNotificationChannelsProps) {
  const [whatsappOptIn, setWhatsappOptIn] = useState(initialWhatsappOptIn);
  const [isPending, setIsPending] = useState(false);
  const [tz, setTz] = useState(preferredTimezone ?? "UTC");
  const [savingTz, setSavingTz] = useState(false);

  async function onToggle(checked: boolean | "indeterminate") {
    const value = checked === true;
    if (!initialHasPhone) {
      toast.error("Add your WhatsApp number in Profile first.");
      return;
    }
    setIsPending(true);
    try {
      const res = await fetch("/api/profile/notification-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappOptIn: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update");
        return;
      }
      setWhatsappOptIn(value);
      toast.success(value ? "WhatsApp notifications enabled" : "WhatsApp notifications disabled");
    } finally {
      setIsPending(false);
    }
  }

  async function handleTzSave() {
    setSavingTz(true);
    try {
      const result = await updateOrganisationTimezone(tz === "UTC" ? null : tz);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Notification timezone saved");
      }
    } finally {
      setSavingTz(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
        <CardDescription>
          Eligibility digests are sent daily at 8:30 AM and deadline reminders at 9:00 AM in your chosen timezone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Your timezone</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              aria-label="Notification timezone"
            >
              {VALID_TIMEZONES.map((z) => (
                <option key={z} value={z}>
                  {TZ_LABELS[z] ?? z}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={handleTzSave} disabled={savingTz}>
              {savingTz && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Save
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
          {lastEligibilityRun ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">
                Last eligibility scan: <span className="font-medium text-foreground">{formatRelativeTime(lastEligibilityRun)}</span>
                {eligibilityGrantCount > 0 && <> &middot; {eligibilityGrantCount} grants scored</>}
              </span>
            </>
          ) : (
            <>
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Eligibility scan pending &mdash; runs daily at 8:30 AM in your timezone
              </span>
            </>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Receive grant match and deadline notifications via WhatsApp</span>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Checkbox
              checked={whatsappOptIn}
              onCheckedChange={onToggle}
              disabled={!initialHasPhone}
            />
          )}
        </div>
        {!initialHasPhone && (
          <p className="text-sm text-muted-foreground">
            Add your WhatsApp number in{" "}
            <Link href="/profile">
              <Button variant="link" className="h-auto p-0 text-sm">
                Profile <ArrowRight className="ml-0.5 inline h-3 w-3" />
              </Button>
            </Link>{" "}
            to enable this.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
