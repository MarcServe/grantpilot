"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PLAN_CATALOG, getPublicStripePriceId } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ApplicationUpgradeDialog({ open, onOpenChange, returnTo = "/founder-pack" }: { open: boolean; onOpenChange: (open: boolean) => void; returnTo?: "/founder-pack" | "/question-assistant" | "/grant-assistant" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const growth = PLAN_CATALOG.find((plan) => plan.value === "GROWTH")!;
  async function checkout() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: getPublicStripePriceId("GROWTH"), returnTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not open checkout");
      if (data.url) { window.location.assign(data.url); return; }
      if (data.success) { toast.success("Plan updated. Continue preparing your application."); onOpenChange(false); router.refresh(); }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open checkout");
    } finally { setLoading(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Continue with your full application pack</DialogTitle>
          <DialogDescription>Review your preview first. Upgrade to draft the remaining answers, build your evidence checklist and export your documents.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 rounded-lg border p-4">
          <p className="font-semibold">{growth.name} · {growth.price}</p>
          <p className="text-sm text-muted-foreground">Monthly subscription. Includes 10 application prep runs per month, full Founder Funding Packs and unlimited grant matches. Funding is subject to the funder’s decision.</p>
          <Button className="w-full" disabled={loading} onClick={checkout}>{loading ? "Opening secure checkout…" : `Continue with Growth · ${growth.price}`}</Button>
          <Button variant="ghost" className="w-full" disabled={loading} onClick={() => onOpenChange(false)}>Keep working on my preview</Button>
        </div>
        <Button variant="link" onClick={() => router.push("/billing")}>Compare all plans or manage subscription</Button>
      </DialogContent>
    </Dialog>
  );
}
