import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { matchGrantsToProfile } from "@/lib/claude";
import { notifyOrgMembers } from "@/lib/notify";

export const grantScanner = inngest.createFunction(
  { id: "grant-scanner", name: "Nightly Grant Scanner" },
  { cron: "0 2 * * *" },
  async () => {
    const grants = await prisma.grant.findMany();
    if (grants.length === 0) return { scanned: 0 };

    const orgs = await prisma.organisation.findMany({
      include: {
        profiles: {
          where: { completionScore: { gte: 50 } },
        },
      },
    });

    let matchCount = 0;

    for (const org of orgs) {
      const profile = org.profiles[0];
      if (!profile) continue;

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
          grants.map((g) => ({
            id: g.id,
            name: g.name,
            funder: g.funder,
            amount: g.amount,
            eligibility: g.eligibility,
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
