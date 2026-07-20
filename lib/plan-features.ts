import type { PlanKey } from "./plans";
import { PLAN_LIMITS, PLAN_RANK } from "./plans";

/** Paid-only product capabilities (quotas stay in PLAN_LIMITS). */
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
    company_dna_ai: false,
    website_intelligence_refresh: false,
    grant_auto_improve: false,
    outcome_learning_ai: false,
    founder_pack: false,
    proactive_notifications: false,
    whatsapp_opportunity_alerts: false,
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
  company_dna_ai: "Company DNA scoring is available during an active free trial or on Starter, Growth, Pro, and Business.",
  website_intelligence_refresh:
    "Refreshing website intelligence from your URL is available during an active free trial or on Growth, Pro, and Business.",
  grant_auto_improve: "Grant auto-improve is available during an active free trial or on Growth, Pro, and Business.",
  outcome_learning_ai:
    "AI outcome learning insights are available during an active free trial or on Growth, Pro, and Business. Your outcome was still saved.",
  founder_pack: "Founder Funding Pack is available during an active free trial or on Growth, Pro, and Business.",
  proactive_notifications:
    "Grant match, deadline, and outcome reminder notifications are available during an active free trial or on Starter, Growth, Pro, and Business.",
  whatsapp_opportunity_alerts:
    "WhatsApp opportunity alerts are available during an active free trial or on Growth, Pro, and Business.",
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

export function isFreeTrialActive(source: PlanAccessSource, now = new Date()): boolean {
  if (!source || resolvePlanKey(source.plan) !== "FREE_TRIAL") return false;
  const rawCreatedAt = source.createdAt ?? source.created_at;
  if (!rawCreatedAt) return false;

  const createdAt = readDate(rawCreatedAt);
  if (!createdAt) return false;

  const trialDays = PLAN_LIMITS.FREE_TRIAL.trialDays;
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + trialDays);
  return now.getTime() < expiresAt.getTime();
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
  const plan = resolveEffectivePlanForOrg(source);
  if (plan === "FREE_TRIAL" && isFreeTrialActive(source)) return true;
  return planAllows(plan, capability);
}
