/**
 * Multi-source grant discovery: OpenAI, Perplexity, and Gemini can find grants per org profile.
 * Customer-facing eligibility and notifications are handled by the OpenAI checker funnel.
 * Runs daily; also triggerable via POST /api/grants/discover.
 */

import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  runDiscoveryAndUpsert,
  profileToDiscoveryProfile,
} from "@/lib/grants-discovery";
import { runWithCronLog } from "@/lib/cron-run-log";

export const grantDiscovery = inngest.createFunction(
  { id: "grant-discovery", name: "AI Web Search Grant Discovery (primary)" },
  { cron: "30 */6 * * *" }, // every 6 hours — primary grant source via web search
  async () => runWithCronLog({ jobName: "AI Web Search Grant Discovery", route: "inngest/grant-discovery", trigger: "inngest" }, async () => {
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
        console.error("[grant-discovery] org error:", err);
      }
    }

    return {
      orgs: byOrg.size,
      created: totalCreated,
      updated: totalUpdated,
    };
  })
);
