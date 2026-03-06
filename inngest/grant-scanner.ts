import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { matchGrantsToProfile } from "@/lib/claude";
import { notifyOrgMembers } from "@/lib/notify";
import { grantMatchesFunderLocations } from "@/lib/constants";

export const grantScanner = inngest.createFunction(
  { id: "grant-scanner", name: "Nightly Grant Scanner" },
  { cron: "0 7 * * *" }, // 7:00 UTC — match grants to profiles after sync + discovery
  async () => {
    const supabase = getSupabaseAdmin();
    const { data: grantsData } = await supabase.from("Grant").select("*");
    const allGrants = Array.isArray(grantsData) ? grantsData : [];
    if (allGrants.length === 0) return { scanned: 0 };

    const { data: profilesData } = await supabase
      .from("BusinessProfile")
      .select("*")
      .gte("completionScore", 50);
    const list = Array.isArray(profilesData) ? profilesData : [];
    const byOrg = new Map<string, (typeof list)[number]>();
    for (const p of list) {
      if (!byOrg.has(p.organisationId)) byOrg.set(p.organisationId, p);
    }
    const orgs = Array.from(byOrg.entries()).map(([id, profile]) => ({
      id,
      profiles: [profile],
    }));

    let matchCount = 0;

    for (const org of orgs) {
      const profile = org.profiles[0];
      if (!profile) continue;

      const userFunderLocations = (profile as { funderLocations?: string[] }).funderLocations;
      const grants = allGrants.filter((g: { funderLocations?: string[] }) =>
        grantMatchesFunderLocations(g.funderLocations, userFunderLocations)
      );

      try {
        const matches = await matchGrantsToProfile(
          {
            businessName: profile.businessName,
            sector: profile.sector,
            missionStatement: profile.missionStatement,
            description: profile.description,
            location: profile.location,
            employeeCount: profile.employeeCount,
            annualRevenue: profile.annualRevenue,
            fundingMin: profile.fundingMin,
            fundingMax: profile.fundingMax,
            fundingPurposes: profile.fundingPurposes,
            fundingDetails: profile.fundingDetails,
          },
          grants.map((g: { id: string; name: string; funder: string; amount?: number; eligibility: string; description?: string; objectives?: string; applicantTypes?: string[]; sectors: string[]; regions: string[] }) => ({
            id: g.id,
            name: g.name,
            funder: g.funder,
            amount: g.amount ?? null,
            eligibility: g.eligibility,
            description: g.description ?? null,
            objectives: g.objectives ?? null,
            applicantTypes: g.applicantTypes ?? [],
            sectors: g.sectors,
            regions: g.regions,
          }))
        );

        const highMatches = matches.filter((m) => m.score >= 70);
        if (highMatches.length > 0) {
          await notifyOrgMembers(org.id, "grant_match", {});
          matchCount += highMatches.length;
        }
      } catch (err) {
        console.error(`[grant-scanner] Error for org ${org.id}:`, err);
      }
    }

    return { scanned: orgs.length, matchCount };
  }
);
