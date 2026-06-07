import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getStripe, getPlanFromPriceId } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { PlanKey } from "@/lib/plans";
import type Stripe from "stripe";

type MappedSubscription = {
  customerId: string;
  plan: PlanKey;
};

const SYNCABLE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

async function findMappedSubscriptionForCustomer(
  stripe: ReturnType<typeof getStripe>,
  customerId: string
): Promise<MappedSubscription | null> {
  const subsResponse = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
    expand: ["data.items.data.price"],
  });

  const subscriptions = subsResponse.data
    .filter((subscription) => SYNCABLE_SUBSCRIPTION_STATUSES.has(subscription.status))
    .sort((a, b) => {
      if (a.status === b.status) return b.created - a.created;
      if (a.status === "active") return -1;
      if (b.status === "active") return 1;
      return b.created - a.created;
    });

  for (const subscription of subscriptions) {
    for (const item of subscription.items.data) {
      const price = item.price as Stripe.Price | null | undefined;
      const plan = getPlanFromPriceId(price?.id ?? "");
      if (plan) return { customerId, plan };
    }
  }

  return null;
}

async function getCustomerIdsByEmail(
  stripe: ReturnType<typeof getStripe>,
  email: string
): Promise<string[]> {
  const listResponse = await stripe.customers.list({
    email,
    limit: 10,
  });
  return listResponse.data.map((customer) => customer.id);
}

/**
 * POST /api/billing/sync
 * Looks up Stripe customer by current user email, gets active subscription,
 * maps price to plan, updates Organisation (plan + stripeId), returns plan.
 * Use when billing UI is out of sync (e.g. subscription created in Stripe dashboard).
 */
export async function POST() {
  try {
    const { user, org, orgId } = await getActiveOrg();
    const email = (user as { email?: string }).email;
    if (!email?.trim()) {
      return NextResponse.json({ success: false, error: "User email not found" }, { status: 400 });
    }

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();
    const orgStripeId =
      typeof (org as { stripeId?: unknown }).stripeId === "string"
        ? ((org as { stripeId?: string }).stripeId ?? "").trim()
        : "";

    const candidateCustomerIds = new Set<string>();
    if (orgStripeId) candidateCustomerIds.add(orgStripeId);
    for (const customerId of await getCustomerIdsByEmail(stripe, email.trim().toLowerCase())) {
      candidateCustomerIds.add(customerId);
    }

    if (candidateCustomerIds.size === 0) {
      return NextResponse.json(
        { success: false, error: "No Stripe customer found for this email" },
        { status: 404 }
      );
    }

    for (const customerId of candidateCustomerIds) {
      try {
        const mapped = await findMappedSubscriptionForCustomer(stripe, customerId);
        if (!mapped) continue;

        const { error } = await supabase
          .from("Organisation")
          .update({ plan: mapped.plan, stripeId: mapped.customerId })
          .eq("id", orgId);
        if (error) {
          console.error("[BILLING_SYNC] update failed:", error);
          return NextResponse.json({ success: false, error: "Failed to update plan" }, { status: 500 });
        }
        return NextResponse.json({ success: true, plan: mapped.plan });
      } catch (error) {
        console.error("[BILLING_SYNC] customer lookup failed:", {
          customerId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json(
      { success: false, error: "No active GrantsCopilot subscription found for this account" },
      { status: 404 }
    );
  } catch (e) {
    console.error("[BILLING_SYNC] error:", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
