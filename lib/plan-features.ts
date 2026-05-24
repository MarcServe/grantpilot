import type { PlanKey } from "./plans";
import { PLAN_LIMITS } from "./plans";

/** Paid-only product capabilities (quotas stay in PLAN_LIMITS). */
export type PlanCapability =
  | "company_dna_ai"
  | "website_intelligence_refresh"
  | "grant_auto_improve"
  | "outcome_learning_ai"
  | "founder_pack"
  | "proactive_notifications";

export const PLAN_CAPABILITIES: Record<PlanKey, Record<PlanCapability, boolean>> = {
  FREE_TRIAL: {
    company_dna_ai: false,
    website_intelligence_refresh: false,
    grant_auto_improve: false,
    outcome_learning_ai: false,
    founder_pack: false,
    proactive_notifications: false,
  },
  PRO: {
    company_dna_ai: true,
    website_intelligence_refresh: true,
    grant_auto_improve: true,
    outcome_learning_ai: true,
    founder_pack: true,
    proactive_notifications: true,
  },
  GROWTH: {
    company_dna_ai: true,
    website_intelligence_refresh: true,
    grant_auto_improve: true,
    outcome_learning_ai: true,
    founder_pack: true,
    proactive_notifications: true,
  },
  BUSINESS: {
    company_dna_ai: true,
    website_intelligence_refresh: true,
    grant_auto_improve: true,
    outcome_learning_ai: true,
    founder_pack: true,
    proactive_notifications: true,
  },
};

export const PLAN_CAPABILITY_MESSAGES: Record<PlanCapability, string> = {
  company_dna_ai: "Company DNA autofill is available during an active free trial or on Growth, Pro, and Business.",
  website_intelligence_refresh:
    "Refreshing website intelligence from your URL is available during an active free trial or on Growth, Pro, and Business.",
  grant_auto_improve: "Grant auto-improve is available during an active free trial or on Growth, Pro, and Business.",
  outcome_learning_ai:
    "AI outcome learning insights are available during an active free trial or on Growth, Pro, and Business. Your outcome was still saved.",
  founder_pack: "Founder Funding Pack is available during an active free trial or on Growth, Pro, and Business.",
  proactive_notifications:
    "Grant match, deadline, and outcome reminder notifications are available during an active free trial or on Growth, Pro, and Business.",
};

export function resolvePlanKey(plan: unknown): PlanKey {
  if (typeof plan === "string") {
    const normalized = plan.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    if (normalized in PLAN_LIMITS) return normalized as PlanKey;
    if (normalized === "FREE" || normalized === "STARTER" || normalized === "TRIAL") return "FREE_TRIAL";
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
} | null | undefined;

export function isFreeTrialActive(source: PlanAccessSource, now = new Date()): boolean {
  if (!source || resolvePlanKey(source.plan) !== "FREE_TRIAL") return false;
  const rawCreatedAt = source.createdAt ?? source.created_at;
  if (!rawCreatedAt) return false;

  const createdAt = rawCreatedAt instanceof Date ? rawCreatedAt : new Date(rawCreatedAt);
  if (Number.isNaN(createdAt.getTime())) return false;

  const trialDays = PLAN_LIMITS.FREE_TRIAL.trialDays;
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + trialDays);
  return now.getTime() < expiresAt.getTime();
}

export function planAllowsForOrg(source: PlanAccessSource, capability: PlanCapability): boolean {
  const plan = resolvePlanKey(source?.plan);
  if (plan === "FREE_TRIAL" && isFreeTrialActive(source)) return true;
  return planAllows(plan, capability);
}
