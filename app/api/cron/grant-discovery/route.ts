import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  createDiscoveryProviderStatsMap,
  mergeDiscoveryProviderStats,
  runDiscoveryAndUpsert,
  profileToDiscoveryProfile,
} from "@/lib/grants-discovery";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for many orgs

/**
 * GET /api/cron/grant-discovery
 * Vercel Cron fallback: runs the same multi-agent grant discovery as the Inngest
 * grant-discovery job. Call daily at 6:30 UTC so new grants are added even if
 * Inngest is not configured.
 *
 * Security: requires Authorization: Bearer <CRON_SECRET> (set CRON_SECRET in Vercel).
 * If you get 404: redeploy so this route is included. If you get 401: use the same value as CRON_SECRET in the header.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWithCronLog(
      { jobName: "AI Web Search Grant Discovery", route: "/api/cron/grant-discovery", trigger: "vercel" },
      async () => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
          .from("BusinessProfile")
          .select("*")
          .gte("completionScore", 30);
        const profiles = data ?? [];

        const byOrg = new Map<string, (typeof profiles)[number]>();
        for (const p of profiles as { organisationId?: string; organisation_id?: string }[]) {
          const orgId = p.organisationId ?? p.organisation_id;
          if (orgId && !byOrg.has(orgId)) byOrg.set(orgId, p as (typeof profiles)[number]);
        }

        let totalCreated = 0;
        let totalUpdated = 0;
        const providers = {
          openai: 0,
          perplexity: 0,
          claude: 0,
          gemini: 0,
        };
        const providerStats = createDiscoveryProviderStatsMap();
        let rejected = 0;

        for (const [, profile] of byOrg) {
          try {
            const discoveryProfile = profileToDiscoveryProfile({
              businessName: profile.businessName,
              sector: profile.sector,
              description: profile.description,
              location: profile.location,
              fundingMin: profile.fundingMin,
              fundingMax: profile.fundingMax,
              fundingPurposes: profile.fundingPurposes,
              funderLocations: (profile as { funderLocations?: string[] }).funderLocations,
            });
            const discoveryResult = await runDiscoveryAndUpsert(discoveryProfile);
            providers.openai += discoveryResult.openai;
            providers.perplexity += discoveryResult.perplexity;
            providers.claude += discoveryResult.claude;
            providers.gemini += discoveryResult.gemini;
            mergeDiscoveryProviderStats(providerStats, discoveryResult.providerStats);
            totalCreated += discoveryResult.created;
            totalUpdated += discoveryResult.updated;
            rejected += discoveryResult.rejected;
          } catch (err) {
            console.error("[cron/grant-discovery] org error:", err);
          }
        }

        return {
          orgs: byOrg.size,
          providers,
          providerStats,
          created: totalCreated,
          updated: totalUpdated,
          rejected,
        };
      }
    );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("[cron/grant-discovery]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Grant discovery failed" },
      { status: 500 }
    );
  }
}
