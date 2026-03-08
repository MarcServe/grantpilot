import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/stripe";
import { BillingClient } from "@/components/billing/billing-client";
import { NotificationTimezone } from "@/components/billing/notification-timezone";

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

  const plan = org.plan as keyof typeof PLAN_LIMITS;
  const limits = PLAN_LIMITS[plan];

  const preferredTimezone = (org as { preferredTimezone?: string | null }).preferredTimezone ?? null;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your subscription and view usage.
        </p>
      </div>

      <div className="mb-8">
        <NotificationTimezone preferredTimezone={preferredTimezone} />
      </div>

      <BillingClient
        currentPlan={org.plan}
        autoFillCount={autoFillCount ?? 0}
        matchCount={matchCount ?? 0}
        limits={{
          autoFillsPerMonth: limits.autoFillsPerMonth,
          matchesPerMonth: limits.matchesPerMonth,
        }}
        billingSuccessFromRedirect={billingSuccess}
      />
    </div>
  );
}
