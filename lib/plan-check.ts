import { getSupabaseAdmin } from "./supabase";
import { PLAN_LIMITS, type PlanKey } from "./plans";
import { isFreeTrialActive, planAllowsForOrg, resolvePlanKey, type PlanCapability, type PlanAccessSource } from "./plan-features";
import { getPlanFromPriceId, getStripe } from "./stripe";

type OrganisationPlanRow = {
  plan?: string | null;
  createdAt?: string | Date | null;
  created_at?: string | Date | null;
  stripeId?: string | null;
  stripe_id?: string | null;
};

export async function getOrganisationPlanKey(organisationId: string): Promise<PlanKey> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("Organisation").select("plan").eq("id", organisationId).maybeSingle();
  return resolvePlanKey(data?.plan);
}

async function getOrganisationPlanAccess(organisationId: string): Promise<OrganisationPlanRow | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("Organisation")
    .select("plan, createdAt, stripeId")
    .eq("id", organisationId)
    .maybeSingle();
  return (data as OrganisationPlanRow | null) ?? null;
}

async function syncActiveStripePlan(
  organisationId: string,
  org: OrganisationPlanRow | null
): Promise<PlanKey | null> {
  const customerId = org?.stripeId ?? org?.stripe_id;
  if (!customerId || !process.env.STRIPE_SECRET_KEY) return null;

  try {
    const stripe = getStripe();
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
      expand: ["data.items.data.price"],
    });
    const active = subs.data
      .filter((sub) => sub.status === "active" || sub.status === "trialing")
      .sort((a, b) => b.created - a.created);

    for (const sub of active) {
      for (const item of sub.items.data) {
        const plan = getPlanFromPriceId(item.price?.id ?? "");
        if (!plan) continue;
        await getSupabaseAdmin()
          .from("Organisation")
          .update({ plan })
          .eq("id", organisationId);
        return plan;
      }
    }
  } catch (error) {
    console.error("[PLAN_CHECK] Stripe plan sync failed", {
      organisationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}

export async function organisationAllowsCapability(
  organisationId: string,
  capability: PlanCapability
): Promise<boolean> {
  const org = await getOrganisationPlanAccess(organisationId);
  if (planAllowsForOrg(org as PlanAccessSource, capability)) return true;

  const stripePlan = await syncActiveStripePlan(organisationId, org);
  if (!stripePlan) return false;
  return planAllowsForOrg(
    {
      plan: stripePlan,
      createdAt: org?.createdAt ?? org?.created_at ?? null,
    },
    capability
  );
}

export async function checkUsageLimit(
  organisationId: string,
  type: "autofill" | "match"
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = getSupabaseAdmin();
  const { data: org } = await supabase
    .from("Organisation")
    .select("plan, createdAt")
    .eq("id", organisationId)
    .single();
  if (!org) return { allowed: false, remaining: 0 };

  const orgAccess = org as OrganisationPlanRow;
  const plan = resolvePlanKey(orgAccess.plan);
  if (plan === "FREE_TRIAL" && !isFreeTrialActive(orgAccess)) {
    return { allowed: false, remaining: 0 };
  }

  const limits = PLAN_LIMITS[plan];

  const limitKey = type === "autofill" ? "autoFillsPerMonth" : "matchesPerMonth";
  const monthlyLimit = limits[limitKey];

  if (monthlyLimit === Infinity) {
    return { allowed: true, remaining: Infinity };
  }

  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  const fromDate = currentMonth.toISOString();

  const { count: usageCount } = await supabase
    .from("Usage")
    .select("id", { count: "exact", head: true })
    .eq("organisationId", organisationId)
    .eq("type", type)
    .gte("createdAt", fromDate);

  const count = usageCount ?? 0;
  const remaining = monthlyLimit - count;
  return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
}

export async function recordUsage(organisationId: string, type: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("Usage").insert({ organisationId, type, units: 1 });
}
