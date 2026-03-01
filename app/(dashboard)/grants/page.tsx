import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { GrantsListClient } from "@/components/grants/grants-list-client";

export default async function GrantsPage() {
  const { org } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const { data: grants = [] } = await supabase
    .from("Grant")
    .select("*")
    .order("deadline", { ascending: true });

  const profile = org.profiles?.[0];
  const hasProfile = !!profile;
  const profileComplete = (profile?.completionScore ?? 0) >= 50;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Available Grants</h1>
          <p className="mt-1 text-muted-foreground">
            Browse grants or use AI matching to find the best fit for your business.
          </p>
        </div>
        <Link
          href="/grants/apply-by-link"
          className="shrink-0 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Have a grant link? Apply here
        </Link>
      </div>

      <GrantsListClient
        grants={(grants ?? []).map((g) => ({
          id: g.id,
          name: g.name,
          funder: g.funder,
          amount: g.amount ?? null,
          deadline: g.deadline ?? null,
          sectors: g.sectors ?? [],
          regions: g.regions ?? [],
          eligibility: g.eligibility ?? "",
          applicationUrl: g.applicationUrl ?? "",
        }))}
        hasProfile={hasProfile}
        profileComplete={profileComplete}
      />
    </div>
  );
}
