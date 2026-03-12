"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DashboardNotificationChannelsProps {
  initialWhatsappOptIn: boolean;
  initialHasPhone: boolean;
}

export function DashboardNotificationChannels({
  initialWhatsappOptIn,
  initialHasPhone,
}: DashboardNotificationChannelsProps) {
  const [whatsappOptIn, setWhatsappOptIn] = useState(initialWhatsappOptIn);
  const [isPending, setIsPending] = useState(false);

  async function onToggle(checked: boolean) {
    if (!initialHasPhone) {
      toast.error("Add your WhatsApp number in Profile first.");
      return;
    }
    setIsPending(true);
    try {
      const res = await fetch("/api/profile/notification-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappOptIn: checked }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update");
        return;
      }
      setWhatsappOptIn(checked);
      toast.success(checked ? "WhatsApp notifications enabled" : "WhatsApp notifications disabled");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
        <CardDescription>
          Receive grant match and deadline reminders via WhatsApp when you have a number set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Receive grant match and deadline notifications via WhatsApp</span>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
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
