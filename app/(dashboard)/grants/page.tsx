import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/auth";
import { GrantsListClient } from "@/components/grants/grants-list-client";

export default async function GrantsPage() {
  const { org } = await getActiveOrg();

  const grants = await prisma.grant.findMany({
    orderBy: { deadline: "asc" },
  });

  const profile = org.profiles[0];
  const hasProfile = !!profile;
  const profileComplete = (profile?.completionScore ?? 0) >= 50;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Available Grants</h1>
        <p className="mt-1 text-muted-foreground">
          Browse grants or use AI matching to find the best fit for your business.
        </p>
      </div>

      <GrantsListClient
        grants={grants.map((g) => ({
          ...g,
          amount: g.amount,
          deadline: g.deadline?.toISOString() ?? null,
        }))}
        hasProfile={hasProfile}
        profileComplete={profileComplete}
      />
    </div>
  );
}
