import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getStripe, getPlanFromPriceId } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/billing/sync
 * Looks up Stripe customer by current user email, gets active subscription,
 * maps price to plan, updates Organisation (plan + stripeId), returns plan.
 * Use when billing UI is out of sync (e.g. subscription created in Stripe dashboard).
 */
export async function POST() {
  try {
    const { user, orgId } = await getActiveOrg();
    const email = (user as { email?: string }).email;
    if (!email?.trim()) {
      return NextResponse.json({ success: false, error: "User email not found" }, { status: 400 });
    }

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    const { data: customers } = await stripe.customers.list({
      email: email.trim().toLowerCase(),
      limit: 1,
    });
    const customer = customers.data[0];
    if (!customer) {
      return NextResponse.json(
        { success: false, error: "No Stripe customer found for this email" },
        { status: 404 }
      );
    }

    const { data: subscriptions } = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 1,
      expand: ["data.items.data.price"],
    });
    const subscription = subscriptions.data[0];
    if (!subscription?.items?.data?.length) {
      const { data: trialing } = await stripe.subscriptions.list({
        customer: customer.id,
        status: "trialing",
        limit: 1,
        expand: ["data.items.data.price"],
      });
      const sub = trialing.data[0];
      if (sub?.items?.data?.length) {
        const priceId = sub.items.data[0].price.id;
        const plan = getPlanFromPriceId(priceId);
        const { error } = await supabase
          .from("Organisation")
          .update({ plan, stripeId: customer.id })
          .eq("id", orgId);
        if (error) {
          console.error("[BILLING_SYNC] update failed:", error);
          return NextResponse.json({ success: false, error: "Failed to update plan" }, { status: 500 });
        }
        return NextResponse.json({ success: true, plan });
      }
      return NextResponse.json(
        { success: false, error: "No active or trialing subscription found" },
        { status: 404 }
      );
    }

    const priceId = subscription.items.data[0].price.id;
    const plan = getPlanFromPriceId(priceId);
    const { error } = await supabase
      .from("Organisation")
      .update({ plan, stripeId: customer.id })
      .eq("id", orgId);
    if (error) {
      console.error("[BILLING_SYNC] update failed:", error);
      return NextResponse.json({ success: false, error: "Failed to update plan" }, { status: 500 });
    }
    return NextResponse.json({ success: true, plan });
  } catch (e) {
    console.error("[BILLING_SYNC] error:", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
