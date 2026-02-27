import { prisma } from "./prisma";
import { PLAN_LIMITS, type PlanKey } from "./stripe";

export async function checkUsageLimit(
  organisationId: string,
  type: "autofill" | "match"
): Promise<{ allowed: boolean; remaining: number }> {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
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

  const usageCount = await prisma.usage.count({
    where: {
      organisationId,
      type,
      createdAt: { gte: currentMonth },
    },
  });

  const remaining = monthlyLimit - usageCount;
  return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
}

export async function recordUsage(organisationId: string, type: string): Promise<void> {
  await prisma.usage.create({
    data: { organisationId, type, units: 1 },
  });
}
