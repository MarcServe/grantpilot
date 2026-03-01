import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const priceId = session.metadata?.priceId;

        const plan = getPlanFromPriceId(priceId ?? "");

        if (customerId) {
          const supabase = getSupabaseAdmin();
          await supabase
            .from("Organisation")
            .update({ plan })
            .eq("stripeId", customerId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id ?? "";
        const plan = getPlanFromPriceId(priceId);

        if (subscription.status === "active") {
          const supabase = getSupabaseAdmin();
          await supabase
            .from("Organisation")
            .update({ plan })
            .eq("stripeId", customerId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const supabase = getSupabaseAdmin();
        await supabase
          .from("Organisation")
          .update({ plan: "FREE_TRIAL" })
          .eq("stripeId", customerId);
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
