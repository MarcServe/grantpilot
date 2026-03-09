import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  runDiscoveryAndUpsert,
  profileToDiscoveryProfile,
} from "@/lib/grants-discovery";

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
      const result = await runDiscoveryAndUpsert(discoveryProfile);
      totalCreated += result.created;
      totalUpdated += result.updated;
    } catch (err) {
      console.error("[cron/grant-discovery] org error:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    orgs: byOrg.size,
    created: totalCreated,
    updated: totalUpdated,
  });
}
