import Stripe from "stripe";
import { PLAN_LIMITS, type PlanKey } from "@/lib/plans";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
    stripeClient = new Stripe(key, { apiVersion: "2026-02-25.clover" });
  }
  return stripeClient;
}

export function getPlanFromPriceId(priceId: string): PlanKey {
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID) return "PRO";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID) return "BUSINESS";
  return "FREE_TRIAL";
}
