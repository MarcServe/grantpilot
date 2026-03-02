"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateOrganisationTimezone, VALID_TIMEZONES } from "@/app/(dashboard)/settings/actions";

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

interface NotificationTimezoneProps {
  preferredTimezone: string | null;
}

export function NotificationTimezone({ preferredTimezone }: NotificationTimezoneProps) {
  const [tz, setTz] = useState(preferredTimezone ?? "UTC");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateOrganisationTimezone(tz === "UTC" ? null : tz);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Notification time saved");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Notification time</CardTitle>
        <p className="text-xs font-normal text-muted-foreground">
          Deadline reminders are sent at 9am in this timezone. Set your local region so we notify you in the morning.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <select
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {VALID_TIMEZONES.map((z) => (
            <option key={z} value={z}>
              {TZ_LABELS[z] ?? z}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
