import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { FounderPackContent } from "@/lib/founder-pack";
import { FounderPackClient } from "@/components/founder-pack/founder-pack-client";

export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  businessName: string;
  sector: string;
  founderBackground?: string | null;
  teamExpertise?: string | null;
  financialProjections?: string | null;
}

interface PackRow {
  id: string;
  type: string;
  createdAt: string;
  content: FounderPackContent;
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function FounderPackPage() {
  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();
  const allowed = String((org as { plan?: string } | undefined)?.plan ?? "FREE_TRIAL") !== "FREE_TRIAL";

  const [{ data: profiles }, { data: packs }] = await Promise.all([
    supabase
      .from("BusinessProfile")
      .select("id, businessName, sector, founderBackground, teamExpertise, financialProjections")
      .eq("organisationId", orgId)
      .order("createdAt", { ascending: true }),
    supabase
      .from("FounderFundingPack")
      .select("id, type, createdAt, content")
      .eq("organisationId", orgId)
      .order("createdAt", { ascending: false })
      .limit(10),
  ]);

  const profileRows = ((profiles ?? []) as ProfileRow[]).map((profile) => ({
    id: profile.id,
    businessName: profile.businessName,
    sector: profile.sector,
    founderBackground: profile.founderBackground ?? null,
    teamExpertise: profile.teamExpertise ?? null,
    financialProjections: profile.financialProjections ?? null,
  }));

  const packRows = ((packs ?? []) as PackRow[]).map((pack) => ({
    id: pack.id,
    createdAt: pack.createdAt,
    createdAtLabel: formatDateLabel(pack.createdAt),
    type: pack.type,
    content: pack.content,
  }));

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Founder Funding Pack</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Generate a gated business planning pack for Innovator Founder framing, grants, accelerators, and investor-readiness work.
        </p>
      </div>

      <FounderPackClient profiles={profileRows} packs={packRows} allowed={allowed} />
    </div>
  );
}
