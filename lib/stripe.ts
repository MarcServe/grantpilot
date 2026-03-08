import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
    stripeClient = new Stripe(key, { apiVersion: "2026-02-25.clover" });
  }
  return stripeClient;
}

export const PLAN_LIMITS = {
  FREE_TRIAL: {
    profiles: 1,
    matchesPerMonth: 5,
    autoFillsPerMonth: 1,
    trialDays: 7,
  },
  PRO: {
    profiles: 1,
    matchesPerMonth: Infinity,
    autoFillsPerMonth: 10,
    trialDays: 0,
  },
  BUSINESS: {
    profiles: 5,
    matchesPerMonth: Infinity,
    autoFillsPerMonth: Infinity,
    trialDays: 0,
  },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export function getPlanFromPriceId(priceId: string): PlanKey {
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID) return "PRO";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID) return "BUSINESS";
  return "FREE_TRIAL";
}
