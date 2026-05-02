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

export const PLAN_CATALOG: {
  name: string;
  value: PlanKey;
  marketingName: string;
  price: string;
  detail: string;
  stripePriceIdEnv?: "NEXT_PUBLIC_STRIPE_PRO_PRICE_ID" | "NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID";
  features: string[];
  homepageFeatures: string[];
  cta: string;
  href: string;
  featured?: boolean;
}[] = [
  {
    name: "Free Trial",
    value: "FREE_TRIAL",
    marketingName: "Starter",
    price: "Free",
    detail: "For founders validating funding fit",
    features: ["7-day trial", "1 business profile", "5 grant matches/month", "1 auto-fill/month"],
    homepageFeatures: ["Business profile", "Fresh grant discovery", "Basic eligibility signals"],
    cta: "Start Free",
    href: "/sign-up",
  },
  {
    name: "Pro",
    value: "PRO",
    marketingName: "Pro",
    price: "£99/mo",
    detail: "For SMEs actively applying",
    stripePriceIdEnv: "NEXT_PUBLIC_STRIPE_PRO_PRICE_ID",
    features: [
      "1 business profile",
      "Unlimited grant matches",
      "10 auto-fills/month",
      "Founder Funding Pack",
      "Email notifications",
      "WhatsApp notifications",
    ],
    homepageFeatures: ["Predictive scoring", "AI application drafting", "Deadline reminders", "Outcome learning"],
    cta: "Get Pro",
    href: "/sign-up",
    featured: true,
  },
  {
    name: "Business",
    value: "BUSINESS",
    marketingName: "Business",
    price: "£199/mo",
    detail: "For teams, advisors, and operators",
    stripePriceIdEnv: "NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID",
    features: [
      "5 business profiles",
      "Unlimited grant matches",
      "Unlimited auto-fills",
      "Founder Funding Pack",
      "Priority support",
      "All notification channels",
    ],
    homepageFeatures: ["Multi-profile workspace", "Founder funding pack", "Automation workflows", "Priority intelligence"],
    cta: "Book a Demo",
    href: "#book-demo",
  },
];

export function getPublicStripePriceId(plan: PlanKey): string {
  const item = PLAN_CATALOG.find((p) => p.value === plan);
  if (!item?.stripePriceIdEnv) return "";
  return process.env[item.stripePriceIdEnv] ?? "";
}
