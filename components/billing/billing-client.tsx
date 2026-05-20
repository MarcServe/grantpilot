"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { PLAN_CATALOG, comparePlans, getPublicStripePriceId, type PlanKey } from "@/lib/plans";

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

const PLANS = PLAN_CATALOG.map((plan) => ({
  ...plan,
  priceId: getPublicStripePriceId(plan.value),
}));

type BillingCheckoutResponse = {
  url?: string;
  success?: boolean;
  plan?: PlanKey;
  changed?: boolean;
  scheduled?: boolean;
  effectiveAt?: string;
  error?: string;
};

function isPlanKey(value: string): value is PlanKey {
  return PLAN_CATALOG.some((plan) => plan.value === value);
}

function formatEffectiveDate(value?: string): string {
  if (!value) return "the end of the current billing period";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "the end of the current billing period";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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

  async function handlePlanChange(priceId: string, planValue: PlanKey) {
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

      const data = (await res.json().catch(() => ({}))) as BillingCheckoutResponse;
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      if (res.ok && data.success) {
        if (data.scheduled) {
          toast.success(`Downgrade scheduled for ${formatEffectiveDate(data.effectiveAt)}.`);
        } else if (data.changed) {
          toast.success("Plan updated successfully.");
        } else {
          toast.success("You are already on this plan.");
        }
        router.refresh();
        return;
      }
      const message =
        data.error ||
        (res.status === 403
          ? "Only organisation owners or admins can manage billing. Switch to an owner/admin account."
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
            <p className="text-sm text-muted-foreground">Application prep runs this month</p>
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

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.value === currentPlan;
          const currentPlanKey = isPlanKey(currentPlan) ? currentPlan : "FREE_TRIAL";
          const planDirection = comparePlans(plan.value, currentPlanKey);
          const buttonLabel = planDirection < 0 ? "Downgrade" : "Upgrade";
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
                <div className="space-y-4">
                  {plan.features.map((block) => (
                    <div key={block.heading} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {block.heading}
                      </p>
                      <ul className="space-y-2">
                        {block.bullets.map((bullet) => {
                          const notIncluded = block.heading.toLowerCase() === "not included";
                          const Icon = notIncluded ? X : Check;
                          return (
                            <li key={bullet} className="flex items-start gap-2 text-sm">
                              <Icon
                                className={`mt-0.5 h-4 w-4 shrink-0 ${
                                  notIncluded ? "text-muted-foreground" : "text-accent"
                                }`}
                              />
                              <span className={notIncluded ? "text-muted-foreground" : undefined}>{bullet}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
                {!isCurrent && plan.priceId && (
                  <Button
                    className="w-full"
                    onClick={() => handlePlanChange(plan.priceId, plan.value)}
                    disabled={!!loading}
                  >
                    {loading === plan.value && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {buttonLabel}
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
