import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/stripe";
import { BillingClient } from "@/components/billing/billing-client";

export default async function BillingPage() {
  const { org, orgId } = await getActiveOrg();

  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  const autoFillCount = await prisma.usage.count({
    where: {
      organisationId: orgId,
      type: "autofill",
      createdAt: { gte: currentMonth },
    },
  });

  const matchCount = await prisma.usage.count({
    where: {
      organisationId: orgId,
      type: "match",
      createdAt: { gte: currentMonth },
    },
  });

  const plan = org.plan as keyof typeof PLAN_LIMITS;
  const limits = PLAN_LIMITS[plan];

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your subscription and view usage.
        </p>
      </div>

      <BillingClient
        currentPlan={org.plan}
        autoFillCount={autoFillCount}
        matchCount={matchCount}
        limits={{
          autoFillsPerMonth: limits.autoFillsPerMonth,
          matchesPerMonth: limits.matchesPerMonth,
        }}
      />
    </div>
  );
}
