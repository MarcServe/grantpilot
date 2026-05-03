import type { PlanKey } from "./plans";
import { PLAN_LIMITS } from "./plans";

/** Paid-only product capabilities (quotas stay in PLAN_LIMITS). */
export type PlanCapability =
  | "company_dna_ai"
  | "website_intelligence_refresh"
  | "grant_auto_improve"
  | "outcome_learning_ai"
  | "founder_pack";

export const PLAN_CAPABILITIES: Record<PlanKey, Record<PlanCapability, boolean>> = {
  FREE_TRIAL: {
    company_dna_ai: false,
    website_intelligence_refresh: false,
    grant_auto_improve: false,
    outcome_learning_ai: false,
    founder_pack: false,
  },
  PRO: {
    company_dna_ai: true,
    website_intelligence_refresh: true,
    grant_auto_improve: true,
    outcome_learning_ai: true,
    founder_pack: true,
  },
  GROWTH: {
    company_dna_ai: true,
    website_intelligence_refresh: true,
    grant_auto_improve: true,
    outcome_learning_ai: true,
    founder_pack: true,
  },
  BUSINESS: {
    company_dna_ai: true,
    website_intelligence_refresh: true,
    grant_auto_improve: true,
    outcome_learning_ai: true,
    founder_pack: true,
  },
};

export const PLAN_CAPABILITY_MESSAGES: Record<PlanCapability, string> = {
  company_dna_ai: "Company DNA autofill is available on Growth, Pro, and Business.",
  website_intelligence_refresh:
    "Refreshing website intelligence from your URL is available on Growth, Pro, and Business.",
  grant_auto_improve: "Grant auto-improve is available on Growth, Pro, and Business.",
  outcome_learning_ai:
    "AI outcome learning insights are available on Growth, Pro, and Business. Your outcome was still saved.",
  founder_pack: "Founder Funding Pack is available on Growth, Pro, and Business.",
};

export function resolvePlanKey(plan: unknown): PlanKey {
  if (typeof plan === "string" && plan in PLAN_LIMITS) return plan as PlanKey;
  return "FREE_TRIAL";
}

export function planAllows(plan: PlanKey, capability: PlanCapability): boolean {
  return PLAN_CAPABILITIES[plan][capability];
}
