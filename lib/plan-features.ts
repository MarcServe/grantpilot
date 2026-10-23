import type { PlanKey } from "./plans";
import { PLAN_LIMITS, PLAN_RANK } from "./plans";

/** Product capabilities; paid application tools stay separate from free discovery. */
export type PlanCapability =
  | "company_dna_ai"
  | "website_intelligence_refresh"
  | "grant_auto_improve"
  | "outcome_learning_ai"
  | "founder_pack"
  | "proactive_notifications"
  | "whatsapp_opportunity_alerts";

export const PLAN_CAPABILITIES: Record<PlanKey, Record<PlanCapability, boolean>> = {
  FREE_TRIAL: {
    company_dna_ai: true,
    website_intelligence_refresh: true,
    grant_auto_improve: false,
    outcome_learning_ai: true,
    founder_pack: false,
    proactive_notifications: true,
    whatsapp_opportunity_alerts: true,
  },
  STARTER: {
    company_dna_ai: true,
    website_intelligence_refresh: false,
    grant_auto_improve: false,
    outcome_learning_ai: false,
    founder_pack: false,
    proactive_notifications: true,
    whatsapp_opportunity_alerts: false,
  },
  PRO: {
    company_dna_ai: true,
    website_intelligence_refresh: true,
    grant_auto_improve: true,
    outcome_learning_ai: true,
    founder_pack: true,
    proactive_notifications: true,
    whatsapp_opportunity_alerts: true,
  },
  GROWTH: {
    company_dna_ai: true,
    website_intelligence_refresh: true,
    grant_auto_improve: true,
    outcome_learning_ai: true,
    founder_pack: true,
    proactive_notifications: true,
    whatsapp_opportunity_alerts: true,
  },
  BUSINESS: {
    company_dna_ai: true,
    website_intelligence_refresh: true,
    grant_auto_improve: true,
    outcome_learning_ai: true,
    founder_pack: true,
    proactive_notifications: true,
    whatsapp_opportunity_alerts: true,
  },
};

export const PLAN_CAPABILITY_MESSAGES: Record<PlanCapability, string> = {
  company_dna_ai: "Company DNA scoring is available on free access or on Starter, Growth, Pro, and Business.",
  website_intelligence_refresh:
    "Refreshing website intelligence from your URL is available on free access or on Growth, Pro, and Business.",
  grant_auto_improve: "Grant auto-improve is available on Growth, Pro, and Business.",
  outcome_learning_ai:
    "AI outcome learning insights are available on free access or on Growth, Pro, and Business. Your outcome was still saved.",
  founder_pack: "Upgrade to Growth, Pro, or Business to prepare and export the full Founder Funding Pack.",
  proactive_notifications:
    "Grant match, deadline, and outcome reminder notifications are available on free access or on Starter, Growth, Pro, and Business.",
  whatsapp_opportunity_alerts:
    "WhatsApp opportunity alerts are available on free access or on Growth, Pro, and Business.",
};

export function resolvePlanKey(plan: unknown): PlanKey {
  if (typeof plan === "string") {
    const normalized = plan.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    if (normalized in PLAN_LIMITS) return normalized as PlanKey;
    if (normalized === "FREE" || normalized === "TRIAL") return "FREE_TRIAL";
    if (normalized.includes("STARTER")) return "STARTER";
    if (normalized.includes("BUSINESS")) return "BUSINESS";
    if (normalized.includes("GROWTH")) return "GROWTH";
    if (normalized.includes("PRO")) return "PRO";
  }
  return "FREE_TRIAL";
}

export function planAllows(plan: PlanKey, capability: PlanCapability): boolean {
  return PLAN_CAPABILITIES[plan][capability];
}

export type PlanAccessSource = {
  plan?: unknown;
  createdAt?: string | Date | null;
  created_at?: string | Date | null;
  communityAccessPlan?: unknown;
  community_access_plan?: unknown;
  communityAccessExpiresAt?: string | Date | null;
  community_access_expires_at?: string | Date | null;
} | null | undefined;

function readDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Free discovery access has no expiry; paid application capabilities stay gated. */
export function isFreeTrialActive(source: PlanAccessSource): boolean {
  return !!source && resolvePlanKey(source.plan) === "FREE_TRIAL";
}

export function getActiveCommunityPlan(source: PlanAccessSource, now = new Date()): PlanKey | null {
  if (!source) return null;
  const rawPlan = source.communityAccessPlan ?? source.community_access_plan;
  if (!rawPlan) return null;
  const expiresAt = readDate(source.communityAccessExpiresAt ?? source.community_access_expires_at);
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) return null;
  return resolvePlanKey(rawPlan);
}

export function resolveEffectivePlanForOrg(source: PlanAccessSource, now = new Date()): PlanKey {
  const storedPlan = resolvePlanKey(source?.plan);
  const communityPlan = getActiveCommunityPlan(source, now);
  if (!communityPlan) return storedPlan;
  return PLAN_RANK[communityPlan] > PLAN_RANK[storedPlan] ? communityPlan : storedPlan;
}

export function planAllowsForOrg(source: PlanAccessSource, capability: PlanCapability): boolean {
  if (!source) return false;
  const plan = resolveEffectivePlanForOrg(source);
  return planAllows(plan, capability);
}
