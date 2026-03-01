import { getSupabaseAdmin } from "./supabase";
import { PLAN_LIMITS, type PlanKey } from "./stripe";

export async function checkUsageLimit(
  organisationId: string,
  type: "autofill" | "match"
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = getSupabaseAdmin();
  const { data: org } = await supabase
    .from("Organisation")
    .select("plan")
    .eq("id", organisationId)
    .single();
  if (!org) return { allowed: false, remaining: 0 };

  const plan = org.plan as PlanKey;
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
