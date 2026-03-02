/**
 * Multi-agent grant discovery: run OpenAI and Gemini to find new grants per org profile.
 * Runs daily; also triggerable via POST /api/grants/discover.
 */

import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  runDiscoveryAndUpsert,
  profileToDiscoveryProfile,
} from "@/lib/grants-discovery";

export const grantDiscovery = inngest.createFunction(
  { id: "grant-discovery", name: "Multi-agent grant discovery (OpenAI + Gemini)" },
  { cron: "0 4 * * *" }, // Daily 4am UTC
  async () => {
    const supabase = getSupabaseAdmin();
    const { data: profiles = [] } = await supabase
      .from("BusinessProfile")
      .select("*")
      .gte("completionScore", 30);

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
        console.error("[grant-discovery] org error:", err);
      }
    }

    return {
      orgs: byOrg.size,
      created: totalCreated,
      updated: totalUpdated,
    };
  }
);
