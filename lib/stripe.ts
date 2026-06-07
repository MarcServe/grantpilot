import Stripe from "stripe";
import { PLAN_CATALOG, type PlanKey } from "@/lib/plans";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
    stripeClient = new Stripe(key, { apiVersion: "2026-02-25.clover" });
  }
  return stripeClient;
}

export function getPlanFromPriceId(priceId: string): PlanKey | null {
  if (!priceId) return null;
  for (const plan of PLAN_CATALOG) {
    const envPriceId = plan.stripePriceIdEnv ? process.env[plan.stripePriceIdEnv] : "";
    const configuredPriceId = plan.stripePriceId ?? envPriceId;
    if (priceId === configuredPriceId) return plan.value;
  }
  return null;
}

export function getAllowedCheckoutPriceIds(): Set<string> {
  const ids = PLAN_CATALOG.map((plan) => {
    const envPriceId = plan.stripePriceIdEnv ? process.env[plan.stripePriceIdEnv] : "";
    return plan.stripePriceId ?? envPriceId;
  });
  return new Set(ids.filter((value): value is string => Boolean(value?.trim())));
}
