"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function TestNotificationButton() {
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/test-notification", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send test notification");
        return;
      }
      toast.success(data.message ?? "Test notification sent. Check your email and WhatsApp.");
    } catch {
      toast.error("Failed to send test notification");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-5 w-5" />
          Test notification
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          Send a sample grant_match_high notification to your own email and WhatsApp (if you have a phone number and WhatsApp template configured).
        </p>
        <Button onClick={handleSend} disabled={loading} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          {loading ? " Sending…" : " Send test notification"}
        </Button>
      </CardContent>
    </Card>
  );
}
