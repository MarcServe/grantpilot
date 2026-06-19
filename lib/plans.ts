export const PLAN_LIMITS = {
  FREE_TRIAL: {
    profiles: 1,
    matchesPerMonth: 5,
    autoFillsPerMonth: 1,
    trialDays: 7,
  },
  STARTER: {
    profiles: 1,
    matchesPerMonth: 50,
    autoFillsPerMonth: 3,
    trialDays: 0,
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

export const PLAN_RANK: Record<PlanKey, number> = {
  FREE_TRIAL: 0,
  STARTER: 1,
  GROWTH: 2,
  PRO: 3,
  BUSINESS: 4,
};

export function comparePlans(left: PlanKey, right: PlanKey): number {
  return PLAN_RANK[left] - PLAN_RANK[right];
}

export type StripePriceIdEnv =
  | "NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID"
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
  stripePriceId?: string;
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
    marketingName: "Free Trial",
    price: "Free",
    detail: "For founders validating funding fit",
    features: [
      {
        heading: "Workspace",
        bullets: ["7-day full-access trial", "1 business profile"],
      },
      {
        heading: "Discovery & scoring",
        bullets: [
          "5 full company-DNA eligibility checks during the trial (cached scores don’t count)",
          "Preliminary fit signals while browsing grants",
        ],
      },
      {
        heading: "Applications",
        bullets: ["1 grant-specific application prep run during the trial"],
      },
      {
        heading: "Trial access",
        bullets: [
          "Company DNA autofill and website intelligence refresh",
          "Grant auto-improve",
          "Founder Funding Pack",
          "AI outcome learning insights",
          "Email reminders and WhatsApp opportunity alerts",
        ],
      },
    ],
    homepageFeatures: ["7-day full-access trial", "Browse grants with preliminary fit", "5 full DNA scores during trial"],
    cta: "Start Free",
    href: "/sign-up",
  },
  {
    name: "Starter",
    value: "STARTER",
    marketingName: "Starter",
    price: "£9.99/mo",
    detail: "Essential grant matching for early founders",
    stripePriceIdEnv: "NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID",
    features: [
      {
        heading: "Workspace",
        bullets: ["1 business profile"],
      },
      {
        heading: "Discovery & scoring",
        bullets: [
          "50 full company-DNA eligibility checks per month",
          "Daily email grant scan and deadline reminders",
          "Preliminary fit signals while browsing grants",
        ],
      },
      {
        heading: "Applications",
        bullets: ["3 grant-specific application prep runs per month"],
      },
      {
        heading: "Not included",
        bullets: [
          "Website intelligence refresh",
          "Grant auto-improve",
          "Founder Funding Pack",
          "AI outcome learning insights",
          "No WhatsApp opportunity alerts",
        ],
      },
    ],
    homepageFeatures: ["50 full DNA scores/month", "Daily email scans", "3 prep runs/month"],
    cta: "Get Starter",
    href: "/sign-up",
  },
  {
    name: "Growth",
    value: "GROWTH",
    marketingName: "Growth",
    price: "£29/mo",
    detail: "Entry paid automation for founders & sole SMEs",
    stripePriceIdEnv: "NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID",
    stripePriceId: "price_1TSmtoP8zypO5fiCQ5fs9USz",
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
        bullets: ["10 grant-specific application prep runs per month"],
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
        bullets: ["Email reminders and WhatsApp opportunity alerts"],
      },
    ],
    homepageFeatures: ["Company DNA engine & unlimited scoring", "10 prep runs/month", "Founder Pack & outcome learning"],
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
    stripePriceId: "price_1T6LUJP8zypO5fiCTSH92fYM",
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
        bullets: ["25 grant-specific application prep runs per month"],
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
        bullets: ["Email reminders and WhatsApp opportunity alerts"],
      },
    ],
    homepageFeatures: ["2 profiles & 25 prep runs/month", "Everything in Growth with higher limits", "Built for heavier funding pipelines"],
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
    stripePriceId: "price_1T6LUuP8zypO5fiCgUzxEh7v",
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
        bullets: ["Unlimited application prep runs"],
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
        bullets: ["Email reminders and WhatsApp opportunity alerts", "Priority support"],
      },
    ],
    homepageFeatures: ["Multi-profile workspace", "Unlimited prep runs", "Priority support & intelligence"],
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
  return process.env[item.stripePriceIdEnv] ?? item.stripePriceId ?? "";
}
