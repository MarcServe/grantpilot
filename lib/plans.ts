export const PLAN_LIMITS = {
  FREE_TRIAL: {
    profiles: 1,
    matchesPerMonth: 5,
    autoFillsPerMonth: 1,
    trialDays: 7,
  },
  GROWTH: {
    profiles: 1,
    matchesPerMonth: Infinity,
    autoFillsPerMonth: 10,
    trialDays: 0,
  },
  PRO: {
    profiles: 2,
    matchesPerMonth: Infinity,
    autoFillsPerMonth: 25,
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

export type StripePriceIdEnv =
  | "NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID"
  | "NEXT_PUBLIC_STRIPE_PRO_PRICE_ID"
  | "NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID";

/** Grouped bullets for billing/pricing UI (workspace → intelligence → collateral). */
export type PlanCatalogFeatureBlock = {
  heading: string;
  bullets: string[];
};

export type PlanCatalogRow = {
  name: string;
  value: PlanKey;
  marketingName: string;
  price: string;
  detail: string;
  stripePriceIdEnv?: StripePriceIdEnv;
  /** Logical groupings aligned with PLAN_CAPABILITIES + PLAN_LIMITS enforcement */
  features: PlanCatalogFeatureBlock[];
  homepageFeatures: string[];
  cta: string;
  href: string;
  featured?: boolean;
};

export const PLAN_CATALOG: PlanCatalogRow[] = [
  {
    name: "Free Trial",
    value: "FREE_TRIAL",
    marketingName: "Starter",
    price: "Free",
    detail: "For founders validating funding fit",
    features: [
      {
        heading: "Workspace",
        bullets: ["7-day Starter trial", "1 business profile"],
      },
      {
        heading: "Discovery & scoring",
        bullets: [
          "5 full company-DNA eligibility checks per month (cached scores don’t count)",
          "Preliminary fit signals while browsing grants",
        ],
      },
      {
        heading: "Applications",
        bullets: ["1 AI application auto-fill per month"],
      },
      {
        heading: "Not included",
        bullets: ["Company DNA autofill & website intelligence refresh", "Grant auto-improve", "Founder Funding Pack", "AI outcome learning insights"],
      },
    ],
    homepageFeatures: ["Manual profile & uploads", "Browse grants with preliminary fit", "5 full DNA scores per month"],
    cta: "Start Free",
    href: "/sign-up",
  },
  {
    name: "Growth",
    value: "GROWTH",
    marketingName: "Growth",
    price: "£29/mo",
    detail: "Entry paid automation for founders & sole SMEs",
    stripePriceIdEnv: "NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID",
    features: [
      {
        heading: "Workspace",
        bullets: ["1 business profile"],
      },
      {
        heading: "Discovery & scoring",
        bullets: ["Unlimited full eligibility & company-DNA scoring"],
      },
      {
        heading: "Applications",
        bullets: ["10 AI application auto-fills per month"],
      },
      {
        heading: "Intelligence",
        bullets: ["Company DNA autofill from website intelligence", "On-demand website intelligence refresh"],
      },
      {
        heading: "Grant writing",
        bullets: ["Grant-specific auto-improve (profile or single application)"],
      },
      {
        heading: "Collateral & learning",
        bullets: ["Founder Funding Pack", "AI insights when you record application outcomes"],
      },
      {
        heading: "Notifications",
        bullets: ["Email & WhatsApp"],
      },
    ],
    homepageFeatures: ["Company DNA engine & unlimited scoring", "10 AI auto-fills/month", "Founder Pack & outcome learning"],
    cta: "Get Growth",
    href: "/sign-up",
  },
  {
    name: "Pro",
    value: "PRO",
    marketingName: "Pro",
    price: "£99/mo",
    detail: "For teams scaling grant volume across profiles",
    stripePriceIdEnv: "NEXT_PUBLIC_STRIPE_PRO_PRICE_ID",
    features: [
      {
        heading: "Workspace",
        bullets: ["Up to 2 business profiles"],
      },
      {
        heading: "Discovery & scoring",
        bullets: ["Unlimited full eligibility & company-DNA scoring"],
      },
      {
        heading: "Applications",
        bullets: ["25 AI application auto-fills per month"],
      },
      {
        heading: "Intelligence",
        bullets: ["Company DNA autofill from website intelligence", "On-demand website intelligence refresh"],
      },
      {
        heading: "Grant writing",
        bullets: ["Grant-specific auto-improve (profile or single application)"],
      },
      {
        heading: "Collateral & learning",
        bullets: ["Founder Funding Pack", "AI insights when you record application outcomes"],
      },
      {
        heading: "Notifications",
        bullets: ["Email & WhatsApp"],
      },
    ],
    homepageFeatures: ["2 profiles & 25 auto-fills/month", "Everything in Growth with higher limits", "Built for heavier application pipelines"],
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
      {
        heading: "Workspace",
        bullets: ["Up to 5 business profiles"],
      },
      {
        heading: "Discovery & scoring",
        bullets: ["Unlimited full eligibility & company-DNA scoring"],
      },
      {
        heading: "Applications",
        bullets: ["Unlimited AI application auto-fills"],
      },
      {
        heading: "Intelligence",
        bullets: ["Company DNA autofill from website intelligence", "On-demand website intelligence refresh"],
      },
      {
        heading: "Grant writing",
        bullets: ["Grant-specific auto-improve (profile or single application)"],
      },
      {
        heading: "Collateral & learning",
        bullets: ["Founder Funding Pack", "AI insights when you record application outcomes"],
      },
      {
        heading: "Notifications & support",
        bullets: ["Email & WhatsApp", "Priority support"],
      },
    ],
    homepageFeatures: ["Multi-profile workspace", "Unlimited automation", "Priority support & intelligence"],
    cta: "Get Business",
    href: "/sign-up",
  },
];

/** Display name for emails/WhatsApp (matches marketing tier names). */
export function planNotifyDisplayName(plan: PlanKey): string {
  const row = PLAN_CATALOG.find((p) => p.value === plan);
  return row?.marketingName ?? plan;
}

export function getPublicStripePriceId(plan: PlanKey): string {
  const item = PLAN_CATALOG.find((p) => p.value === plan);
  if (!item?.stripePriceIdEnv) return "";
  return process.env[item.stripePriceIdEnv] ?? "";
}
