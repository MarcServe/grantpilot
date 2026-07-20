import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/plans";
import { resolveEffectivePlanForOrg } from "@/lib/plan-features";
import { BillingClient } from "@/components/billing/billing-client";
import { partnerNameFromSlug } from "@/lib/community-access-shared";

interface BillingPageProps {
  searchParams: Promise<{ billing?: string }>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = await searchParams;
  const billingSuccess = params.billing === "success";
  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  const fromDate = currentMonth.toISOString();

  const { count: autoFillCount } = await supabase
    .from("Usage")
    .select("id", { count: "exact", head: true })
    .eq("organisationId", orgId)
    .eq("type", "autofill")
    .gte("createdAt", fromDate);

  const { count: matchCount } = await supabase
    .from("Usage")
    .select("id", { count: "exact", head: true })
    .eq("organisationId", orgId)
    .eq("type", "match")
    .gte("createdAt", fromDate);

  const plan = resolveEffectivePlanForOrg(org);
  const limits = PLAN_LIMITS[plan];
  const communityAccessExpiresAt = org.communityAccessExpiresAt ?? org.community_access_expires_at ?? null;
  const communityPartnerSlug = org.communityPartnerSlug ?? org.community_partner_slug ?? null;
  const communityAccessPlan = org.communityAccessPlan ?? org.community_access_plan ?? null;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your subscription and view usage.
        </p>
      </div>

      <BillingClient
        currentPlan={plan}
        autoFillCount={autoFillCount ?? 0}
        matchCount={matchCount ?? 0}
        limits={{
          autoFillsPerMonth: limits.autoFillsPerMonth,
          matchesPerMonth: limits.matchesPerMonth,
        }}
        billingSuccessFromRedirect={billingSuccess}
        communityAccess={
          communityAccessPlan && communityAccessExpiresAt && communityPartnerSlug
            ? {
                partnerName: partnerNameFromSlug(String(communityPartnerSlug)),
                expiresAt: String(communityAccessExpiresAt),
                plan: String(communityAccessPlan),
              }
            : undefined
        }
      />
    </div>
  );
}
