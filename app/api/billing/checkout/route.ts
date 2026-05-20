import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { comparePlans, type PlanKey } from "@/lib/plans";
import { getAllowedCheckoutPriceIds, getPlanFromPriceId, getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

const checkoutSchema = z.object({
  priceId: z.string().min(1),
});

const ACTIVE_GRANTSCOPILOT_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

type ActiveGrantsCopilotSubscription = {
  subscription: Stripe.Subscription;
  item: Stripe.SubscriptionItem;
  plan: PlanKey;
  priceId: string;
};

function normaliseAppUrl(req: Request): string {
  const fallbackOrigin = getRequestOrigin(req);
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const candidate = rawAppUrl || fallbackOrigin;
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return fallbackOrigin;
  }
}

function getRequestOrigin(req: Request): string {
  const requestUrl = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");

  if (forwardedHost) {
    try {
      return new URL(`${forwardedProto}://${forwardedHost}`).origin;
    } catch {
      return requestUrl.origin;
    }
  }

  return requestUrl.origin;
}

async function findActiveGrantsCopilotSubscription(
  stripe: ReturnType<typeof getStripe>,
  customerId: string
): Promise<ActiveGrantsCopilotSubscription | null> {
  const subsResponse = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
    expand: ["data.items.data.price"],
  });

  const subscriptions = subsResponse.data
    .filter((subscription) => ACTIVE_GRANTSCOPILOT_SUBSCRIPTION_STATUSES.has(subscription.status))
    .sort((a, b) => {
      if (a.status === b.status) return b.created - a.created;
      if (a.status === "active") return -1;
      if (b.status === "active") return 1;
      return b.created - a.created;
    });

  for (const subscription of subscriptions) {
    for (const item of subscription.items.data) {
      const priceId = item.price?.id ?? "";
      const plan = getPlanFromPriceId(priceId);
      if (plan) return { subscription, item, plan, priceId };
    }
  }

  return null;
}

async function getOrCreateSchedule(
  stripe: ReturnType<typeof getStripe>,
  subscription: Stripe.Subscription
): Promise<Stripe.SubscriptionSchedule> {
  const existingSchedule = subscription.schedule;
  if (typeof existingSchedule === "string") {
    return stripe.subscriptionSchedules.retrieve(existingSchedule);
  }
  if (existingSchedule && "id" in existingSchedule) {
    return existingSchedule;
  }
  return stripe.subscriptionSchedules.create({ from_subscription: subscription.id });
}

async function scheduleDowngradeAtPeriodEnd({
  stripe,
  active,
  targetPriceId,
  targetPlan,
  orgId,
}: {
  stripe: ReturnType<typeof getStripe>;
  active: ActiveGrantsCopilotSubscription;
  targetPriceId: string;
  targetPlan: PlanKey;
  orgId: string;
}): Promise<string> {
  const { subscription, item } = active;
  const periodStart = item.current_period_start;
  const periodEnd = item.current_period_end;

  if (!periodStart || !periodEnd || periodEnd <= Math.floor(Date.now() / 1000)) {
    throw new Error("Current billing period could not be determined for this subscription");
  }

  const schedule = await getOrCreateSchedule(stripe, subscription);
  const currentPhaseStart = schedule.current_phase?.start_date ?? periodStart;
  const quantity = item.quantity ?? 1;

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    metadata: {
      organisationId: orgId,
      scheduledPlan: targetPlan,
      scheduledPriceId: targetPriceId,
    },
    phases: [
      {
        items: [{ price: active.priceId, quantity }],
        start_date: currentPhaseStart,
        end_date: periodEnd,
        metadata: {
          organisationId: orgId,
          plan: active.plan,
          scheduledPlan: targetPlan,
        },
      },
      {
        items: [{ price: targetPriceId, quantity }],
        start_date: periodEnd,
        metadata: {
          organisationId: orgId,
          plan: targetPlan,
          previousPlan: active.plan,
        },
      },
    ],
    proration_behavior: "none",
  });

  return new Date(periodEnd * 1000).toISOString();
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user, org, orgId, role } = await getActiveOrg();

    if (role !== "OWNER" && role !== "ADMIN") {
      return NextResponse.json(
        { error: `Only organisation owners or admins can manage billing. Current role: ${role}` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (!getAllowedCheckoutPriceIds().has(parsed.data.priceId)) {
      return NextResponse.json({ error: "Unknown or unconfigured billing plan" }, { status: 400 });
    }
    const targetPlan = getPlanFromPriceId(parsed.data.priceId);
    if (!targetPlan) {
      return NextResponse.json({ error: "Unknown or unconfigured billing plan" }, { status: 400 });
    }

    const stripe = getStripe();

    let customerId = org.stripeId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { organisationId: orgId },
      });
      customerId = customer.id;
      const supabase = getSupabaseAdmin();
      await supabase
        .from("Organisation")
        .update({ stripeId: customerId })
        .eq("id", orgId);
    }

    const activeSubscription = await findActiveGrantsCopilotSubscription(stripe, customerId);
    if (activeSubscription) {
      const planComparison = comparePlans(targetPlan, activeSubscription.plan);

      if (planComparison === 0) {
        return NextResponse.json({ success: true, plan: targetPlan, changed: false });
      }

      if (planComparison > 0) {
        await stripe.subscriptions.update(activeSubscription.subscription.id, {
          items: [{ id: activeSubscription.item.id, price: parsed.data.priceId }],
          proration_behavior: "create_prorations",
          metadata: {
            organisationId: orgId,
            plan: targetPlan,
          },
        });

        const supabase = getSupabaseAdmin();
        await supabase
          .from("Organisation")
          .update({ plan: targetPlan, stripeId: customerId })
          .eq("id", orgId);

        return NextResponse.json({ success: true, plan: targetPlan, changed: true });
      }

      const effectiveAt = await scheduleDowngradeAtPeriodEnd({
        stripe,
        active: activeSubscription,
        targetPriceId: parsed.data.priceId,
        targetPlan,
        orgId,
      });

      return NextResponse.json({ success: true, plan: targetPlan, scheduled: true, effectiveAt });
    }

    const appUrl = normaliseAppUrl(req);
    const billingSuccess = new URL("/billing?billing=success", appUrl).toString();
    const billingCancel = new URL("/billing?billing=cancelled", appUrl).toString();

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: parsed.data.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: billingSuccess,
      cancel_url: billingCancel,
      metadata: { priceId: parsed.data.priceId, plan: targetPlan, organisationId: orgId },
    });

    const url = session.url ?? null;
    return NextResponse.json(url ? { url } : { error: "Stripe did not return a checkout URL" });
  } catch (error) {
    console.error("[BILLING_CHECKOUT]", error);
    const msg =
      error instanceof Error ? error.message : "Internal server error";
    const isStripeError =
      error != null &&
      typeof error === "object" &&
      "type" in error &&
      typeof (error as { type: unknown }).type === "string";
    return NextResponse.json(
      {
        error: isStripeError
          ? `Stripe error: ${msg}`
          : msg.includes("STRIPE_SECRET_KEY")
            ? "Stripe is not configured. Please set the STRIPE_SECRET_KEY environment variable."
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}
