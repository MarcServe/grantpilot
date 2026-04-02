import { NextResponse } from "next/server";
import { getStripe, getPlanFromPriceId, type PlanKey } from "@/lib/stripe";
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
            const rows = Array.isArray(data) ? data : (data ? [data] : []);
            if (rows.length === 0) {
              const updated = await updatePlanByCustomerEmail(stripe, supabase, customerId, plan);
              if (updated) {
                const { data: orgData } = await supabase.from("Organisation").select("id").eq("stripeId", customerId).maybeSingle();
                const org = orgData as { id: string } | null;
                if (org?.id) {
                  await notifyOrgMembers(org.id, "subscription_activated", {
                    planName: plan === "BUSINESS" ? "Business" : "Pro",
                  }).catch(console.error);
                }
              }
            } else {
              console.log("[STRIPE_WEBHOOK] checkout.session.completed", { customerId, priceId, plan, rows: rows.length });
              const org = rows[0];
              if (org?.id) {
                await notifyOrgMembers(org.id, "subscription_activated", {
                  planName: plan === "BUSINESS" ? "Business" : "Pro",
                }).catch(console.error);
              }
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
            const rows = Array.isArray(data) ? data : (data ? [data] : []);
            if (rows.length === 0) {
              await updatePlanByCustomerEmail(stripe, supabase, customerId, plan);
            } else {
              console.log("[STRIPE_WEBHOOK] customer.subscription.updated", { customerId, priceId, plan, status: subscription.status, rows: rows.length });
            }
            const orgBeforeTyped = orgBefore as { id: string; plan: string } | null;
            let orgIdToNotify: string | null = orgBeforeTyped?.id ?? (rows.length > 0 ? (rows[0] as { id: string }).id : null);
            if (!orgIdToNotify) {
              const { data: orgRow } = await supabase.from("Organisation").select("id").eq("stripeId", customerId).maybeSingle();
              orgIdToNotify = (orgRow as { id: string } | null)?.id ?? null;
            }
            if (orgIdToNotify && orgBeforeTyped?.plan !== plan) {
              await notifyOrgMembers(orgIdToNotify, "subscription_upgraded", {
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
          const rows = Array.isArray(data) ? data : (data ? [data] : []);
          if (rows.length === 0) {
            await updatePlanByCustomerEmail(stripe, supabase, customerId, "FREE_TRIAL");
          } else {
            console.log("[STRIPE_WEBHOOK] customer.subscription.deleted", { customerId, rows: rows.length });
          }
          let orgId: string | null = rows.length > 0 ? (rows[0] as { id: string }).id : null;
          if (!orgId) {
            const { data: orgRow } = await supabase.from("Organisation").select("id").eq("stripeId", customerId).maybeSingle();
            orgId = (orgRow as { id: string } | null)?.id ?? null;
          }
          if (orgId) {
            await notifyOrgMembers(orgId, "subscription_cancelled", {}).catch(console.error);
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

/**
 * If no Organisation has this stripeId (e.g. subscription was created in Stripe dashboard or via link),
 * try to find org by Stripe customer email and update plan + set stripeId.
 */
async function updatePlanByCustomerEmail(
  stripe: ReturnType<typeof getStripe>,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  customerId: string,
  plan: PlanKey
): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || !("email" in customer) || !customer.email) return false;
    const email = customer.email.trim().toLowerCase();
    if (!email) return false;

    const { data: userRow } = await supabase
      .from("User")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!userRow) return false;

    const userId = (userRow as { id: string }).id;
    const { data: member } = await supabase
      .from("OrganisationMember")
      .select("*")
      .eq("userId", userId)
      .limit(1)
      .maybeSingle();
    if (!member) return false;

    const m = member as Record<string, unknown>;
    const orgId = (m.organisationId ?? m.organisation_id) as string | undefined;
    if (!orgId) return false;

    const { error } = await supabase
      .from("Organisation")
      .update({ plan, stripeId: customerId })
      .eq("id", orgId);
    if (error) {
      console.error("[STRIPE_WEBHOOK] updatePlanByCustomerEmail failed:", error);
      return false;
    }
    console.log("[STRIPE_WEBHOOK] updated org by customer email", { orgId, customerId, plan });
    return true;
  } catch (e) {
    console.error("[STRIPE_WEBHOOK] updatePlanByCustomerEmail error:", e);
    return false;
  }
}
