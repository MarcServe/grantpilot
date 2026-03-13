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
    const diagnostics = { totalGrants: allGrants.length, profilesWithScore50: 0, orgsScanned: 0, highMatchesTotal: 0 };
    if (allGrants.length === 0) {
      console.info("[grant-scanner] No grants in DB", diagnostics);
      return { scanned: 0, matchCount: 0, ...diagnostics };
    }

    const { data: profilesData } = await supabase
      .from("BusinessProfile")
      .select("*")
      .gte("completionScore", 50);
    const list = Array.isArray(profilesData) ? profilesData : [];
    diagnostics.profilesWithScore50 = list.length;
    const byOrg = new Map<string, (typeof list)[number]>();
    for (const p of list) {
      if (!byOrg.has(p.organisationId)) byOrg.set(p.organisationId, p);
    }
    const orgs = Array.from(byOrg.entries()).map(([id, profile]) => ({
      id,
      profiles: [profile],
    }));
    diagnostics.orgsScanned = orgs.length;

    if (orgs.length === 0) {
      console.info("[grant-scanner] No orgs with profile completionScore >= 50", diagnostics);
      return { scanned: 0, matchCount: 0, ...diagnostics };
    }

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

    diagnostics.highMatchesTotal = matchCount;
    if (matchCount === 0) {
      console.info("[grant-scanner] No grant_match notifications sent; run output has diagnostics", diagnostics);
    }
    return { scanned: orgs.length, matchCount, ...diagnostics };
  }
);
