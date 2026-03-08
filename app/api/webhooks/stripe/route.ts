import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import type Stripe from "stripe";

export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[STRIPE_WEBHOOK] Verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const stripe = getStripe();
  const supabase = getSupabaseAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        let priceId = session.metadata?.priceId as string | undefined;

        if (!priceId && session.subscription && typeof session.subscription === "string") {
          const sub = await stripe.subscriptions.retrieve(session.subscription, { expand: ["items.data.price"] });
          priceId = sub.items.data[0]?.price.id ?? "";
        }

        const plan = getPlanFromPriceId(priceId ?? "");

        if (customerId) {
          const { data, error } = await supabase
            .from("Organisation")
            .update({ plan })
            .eq("stripeId", customerId)
            .select("id");
          if (error) {
            console.error("[STRIPE_WEBHOOK] checkout.session.completed update failed:", error);
          } else {
            console.log("[STRIPE_WEBHOOK] checkout.session.completed", { customerId, priceId, plan, rows: data?.length ?? 0 });
            const org = Array.isArray(data) ? data[0] : data;
            if (org?.id) {
              await notifyOrgMembers(org.id, "subscription_activated", {
                planName: plan === "BUSINESS" ? "Business" : "Pro",
              }).catch(console.error);
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id ?? "";
        const plan = getPlanFromPriceId(priceId);
        const activeOrTrialing = subscription.status === "active" || subscription.status === "trialing";

        if (activeOrTrialing) {
          const { data: orgBefore } = await supabase
            .from("Organisation")
            .select("id, plan")
            .eq("stripeId", customerId)
            .maybeSingle();

          const { data, error } = await supabase
            .from("Organisation")
            .update({ plan })
            .eq("stripeId", customerId)
            .select("id");
          if (error) {
            console.error("[STRIPE_WEBHOOK] customer.subscription.updated update failed:", error);
          } else {
            console.log("[STRIPE_WEBHOOK] customer.subscription.updated", { customerId, priceId, plan, status: subscription.status, rows: data?.length ?? 0 });
            const orgBeforeTyped = orgBefore as { id: string; plan: string } | null;
            if (orgBeforeTyped && orgBeforeTyped.plan !== plan) {
              await notifyOrgMembers(orgBeforeTyped.id, "subscription_upgraded", {
                planName: plan === "BUSINESS" ? "Business" : "Pro",
              }).catch(console.error);
            }
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data, error } = await supabase
          .from("Organisation")
          .update({ plan: "FREE_TRIAL" })
          .eq("stripeId", customerId)
          .select("id");
        if (error) {
          console.error("[STRIPE_WEBHOOK] customer.subscription.deleted update failed:", error);
        } else {
          console.log("[STRIPE_WEBHOOK] customer.subscription.deleted", { customerId, rows: data?.length ?? 0 });
          const org = Array.isArray(data) ? data[0] : data;
          if (org?.id) {
            await notifyOrgMembers(org.id, "subscription_cancelled", {}).catch(console.error);
          }
        }
        break;
      }
    }
  } catch (error) {
    console.error("[STRIPE_WEBHOOK] Handler error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function getPlanFromPriceId(priceId: string): "FREE_TRIAL" | "PRO" | "BUSINESS" {
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID) return "PRO";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID) return "BUSINESS";
  return "FREE_TRIAL";
}
