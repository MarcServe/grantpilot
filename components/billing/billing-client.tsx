"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { PLAN_CATALOG, comparePlans, getPublicStripePriceId, type PlanKey } from "@/lib/plans";
import { formatCommunityAccessExpiry } from "@/lib/community-access-shared";

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
  communityAccess?: {
    partnerName: string;
    expiresAt: string;
    plan: string;
  };
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
  communityAccess,
}: BillingClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [enterpriseSubmitting, setEnterpriseSubmitting] = useState(false);
  const [enterpriseForm, setEnterpriseForm] = useState({
    name: "",
    email: "",
    company: "",
    teamSize: "",
    message: "",
  });

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

  async function handleEnterpriseSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnterpriseSubmitting(true);
    try {
      const res = await fetch("/api/billing/enterprise-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enterpriseForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not send enterprise enquiry");
        return;
      }
      toast.success("Enterprise enquiry sent. We will reply from billing shortly.");
      setEnterpriseOpen(false);
      setEnterpriseForm({ name: "", email: "", company: "", teamSize: "", message: "" });
    } catch {
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setEnterpriseSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {communityAccess && (
        <Card className="border-emerald-200 bg-emerald-50/80">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base text-emerald-950">Community pilot access</CardTitle>
                <p className="mt-1 text-sm text-emerald-900">
                  Community pilot access via {communityAccess.partnerName} until{" "}
                  {formatCommunityAccessExpiry(communityAccess.expiresAt)}.
                </p>
              </div>
              <Badge className="w-fit bg-emerald-700 text-white hover:bg-emerald-700">
                {communityAccess.plan.toUpperCase()} access
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-emerald-900">
            No card is required for this pilot entitlement. Paid Stripe subscriptions still take precedence if you upgrade.
          </CardContent>
        </Card>
      )}
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

      <Card className="border-[#071a3a] bg-[#071a3a] text-white">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl">Enterprise</CardTitle>
              <p className="mt-2 text-sm text-white/72">
                Custom grant intelligence for larger teams, advisors, accelerators, and multi-organisation workspaces.
              </p>
            </div>
            <Badge className="w-fit bg-white text-[#071a3a] hover:bg-white">Custom</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "Custom profile and user limits",
              "Higher-volume application workflows",
              "Priority onboarding and support",
              "Procurement and invoice billing",
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-2 text-sm text-white/88">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#4bc7ad]" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
          <Button
            type="button"
            className="bg-white text-[#071a3a] hover:bg-white/90 lg:w-[180px]"
            onClick={() => setEnterpriseOpen(true)}
          >
            Contact billing
          </Button>
        </CardContent>
      </Card>

      <Dialog open={enterpriseOpen} onOpenChange={setEnterpriseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enterprise plan enquiry</DialogTitle>
            <DialogDescription>
              Send your requirements to billing and we will follow up with pricing and setup options.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEnterpriseSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="enterprise-name">Name</Label>
                <Input
                  id="enterprise-name"
                  value={enterpriseForm.name}
                  onChange={(event) => setEnterpriseForm((form) => ({ ...form, name: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="enterprise-email">Email</Label>
                <Input
                  id="enterprise-email"
                  type="email"
                  value={enterpriseForm.email}
                  onChange={(event) => setEnterpriseForm((form) => ({ ...form, email: event.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="enterprise-company">Company</Label>
                <Input
                  id="enterprise-company"
                  value={enterpriseForm.company}
                  onChange={(event) => setEnterpriseForm((form) => ({ ...form, company: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="enterprise-team-size">Team size</Label>
                <Input
                  id="enterprise-team-size"
                  value={enterpriseForm.teamSize}
                  onChange={(event) => setEnterpriseForm((form) => ({ ...form, teamSize: event.target.value }))}
                  placeholder="Users, profiles, or clients"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="enterprise-message">Requirements</Label>
              <Textarea
                id="enterprise-message"
                value={enterpriseForm.message}
                onChange={(event) => setEnterpriseForm((form) => ({ ...form, message: event.target.value }))}
                placeholder="Tell us about profiles, users, grant volume, onboarding, procurement, or billing needs."
                rows={5}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEnterpriseOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={enterpriseSubmitting}>
                {enterpriseSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send enquiry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
