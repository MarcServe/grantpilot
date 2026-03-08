"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface BillingClientProps {
  currentPlan: string;
  autoFillCount: number;
  matchCount: number;
  limits: {
    autoFillsPerMonth: number;
    matchesPerMonth: number;
  };
  /** Set when user returns from Stripe success_url (e.g. /billing?billing=success) */
  billingSuccessFromRedirect?: boolean;
}

const PLANS = [
  {
    name: "Free Trial",
    value: "FREE_TRIAL",
    price: "Free",
    priceId: "",
    features: [
      "7-day trial",
      "1 business profile",
      "5 grant matches/month",
      "1 auto-fill/month",
    ],
  },
  {
    name: "Pro",
    value: "PRO",
    price: "£99/mo",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ?? "",
    features: [
      "1 business profile",
      "Unlimited grant matches",
      "10 auto-fills/month",
      "Email notifications",
      "WhatsApp notifications",
    ],
  },
  {
    name: "Business",
    value: "BUSINESS",
    price: "£199/mo",
    priceId: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID ?? "",
    features: [
      "5 business profiles",
      "Unlimited grant matches",
      "Unlimited auto-fills",
      "Priority support",
      "All notification channels",
    ],
  },
];

export function BillingClient({
  currentPlan,
  autoFillCount,
  matchCount,
  limits,
  billingSuccessFromRedirect = false,
}: BillingClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // After Stripe checkout success: sync plan from Stripe and show toast, then clear URL
  useEffect(() => {
    if (!billingSuccessFromRedirect) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/sync", { method: "POST" });
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          toast.success("Payment successful. Your plan has been updated.");
          router.replace("/billing");
          router.refresh();
        } else {
          toast.success("Payment received. If your plan doesn’t update, click “Refresh subscription status”.");
          router.replace("/billing");
          router.refresh();
        }
      } catch {
        if (!cancelled) {
          toast.success("Payment received. If your plan doesn’t update, click “Refresh subscription status”.");
          router.replace("/billing");
          router.refresh();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [billingSuccessFromRedirect, router]);

  async function handleRefreshSubscription() {
    setSyncing(true);
    try {
      const res = await fetch("/api/billing/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("Subscription updated");
        router.refresh();
      } else {
        toast.error(data.error ?? "Could not refresh subscription");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSyncing(false);
    }
  }

  async function handleUpgrade(priceId: string, planValue: string) {
    if (!priceId) {
      toast.error("Price ID not configured");
      return;
    }

    setLoading(planValue);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      const message =
        data.error ||
        (res.status === 403
          ? "Only organisation owners or admins can upgrade. Switch to an owner/admin account."
          : res.status === 500
            ? "Server error. Please try again or contact support."
            : "Failed to open checkout. Please try again.");
      toast.error(message);
    } catch {
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshSubscription}
          disabled={syncing}
        >
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh subscription status
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Current Usage</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Auto-fills this month</p>
            <p className="text-2xl font-bold">
              {autoFillCount}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {limits.autoFillsPerMonth === Infinity ? "Unlimited" : limits.autoFillsPerMonth}
              </span>
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Matches this month</p>
            <p className="text-2xl font-bold">
              {matchCount}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {limits.matchesPerMonth === Infinity ? "Unlimited" : limits.matchesPerMonth}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.value === currentPlan;
          return (
            <Card
              key={plan.value}
              className={isCurrent ? "border-primary" : ""}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Current</Badge>}
                </div>
                <p className="text-2xl font-bold">{plan.price}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Check className="h-4 w-4 text-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {!isCurrent && plan.priceId && (
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(plan.priceId, plan.value)}
                    disabled={!!loading}
                  >
                    {loading === plan.value && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Upgrade
                  </Button>
                )}
                {isCurrent && (
                  <Button variant="outline" className="w-full" disabled>
                    Current Plan
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
