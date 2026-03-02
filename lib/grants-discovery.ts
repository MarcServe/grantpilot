/**
 * Multi-agent grant discovery: run Claude (default), OpenAI, and Gemini in parallel,
 * merge, dedupe by (name, funder) with Claude preferred, then upsert.
 * Used by Inngest job and by POST /api/grants/discover.
 */

import type { DiscoveryProfile } from "./grants-discovery-types";
import { discoverGrantsWithClaude } from "./grants-discovery-claude";
import { discoverGrantsWithOpenAI } from "./grants-discovery-openai";
import { discoverGrantsWithGemini } from "./grants-discovery-gemini";
import { upsertGrant, type GrantInput } from "./grants-ingest";

function normaliseKey(g: GrantInput): string {
  return `${(g.name ?? "").toLowerCase().trim()}|${(g.funder ?? "").toLowerCase().trim()}`;
}

/** Canonical externalId for discovery so we upsert one row per (name, funder). */
function discoveryExternalId(key: string): string {
  const slug = key.replace(/\|/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 80);
  return `discovery-${slug}`;
}

/**
 * Run Claude (default), OpenAI, and Gemini discovery in parallel. Merge and dedupe
 * by (name, funder), preferring Claude then OpenAI then Gemini. Upsert each grant.
 */
export async function runDiscoveryAndUpsert(profile: DiscoveryProfile): Promise<{
  claude: number;
  openai: number;
  gemini: number;
  created: number;
  updated: number;
}> {
  const [claudeGrants, openaiGrants, geminiGrants] = await Promise.all([
    discoverGrantsWithClaude(profile),
    discoverGrantsWithOpenAI(profile),
    discoverGrantsWithGemini(profile),
  ]);

  const byKey = new Map<string, GrantInput>();
  for (const g of claudeGrants) {
    const key = normaliseKey(g);
    byKey.set(key, { ...g, externalId: discoveryExternalId(key), source: "claude" });
  }
  for (const g of openaiGrants) {
    const key = normaliseKey(g);
    if (!byKey.has(key))
      byKey.set(key, { ...g, externalId: discoveryExternalId(key), source: "openai" });
  }
  for (const g of geminiGrants) {
    const key = normaliseKey(g);
    if (!byKey.has(key))
      byKey.set(key, { ...g, externalId: discoveryExternalId(key), source: "gemini" });
  }

  let created = 0;
  let updated = 0;
  for (const g of byKey.values()) {
    try {
      const { created: c } = await upsertGrant(g);
      if (c) created++;
      else updated++;
    } catch (e) {
      console.warn("[grants-discovery] upsert skip", g.externalId, e);
    }
  }

  return {
    claude: claudeGrants.length,
    openai: openaiGrants.length,
    gemini: geminiGrants.length,
    created,
    updated,
  };
}

/**
 * Build DiscoveryProfile from a BusinessProfile-like row (e.g. from Supabase).
 */
export function profileToDiscoveryProfile(profile: {
  businessName?: string;
  sector?: string;
  description?: string;
  location?: string;
  fundingMin?: number;
  fundingMax?: number;
  fundingPurposes?: string[];
  funderLocations?: string[];
}): DiscoveryProfile {
  return {
    businessName: profile.businessName ?? "",
    sector: profile.sector ?? "",
    description: profile.description ?? "",
    location: profile.location ?? "",
    fundingMin: Number(profile.fundingMin) || 0,
    fundingMax: Number(profile.fundingMax) || 0,
    fundingPurposes: Array.isArray(profile.fundingPurposes) ? profile.fundingPurposes : [],
    funderLocations: (profile.funderLocations ?? []) as ("US" | "UK" | "EU" | "Global")[],
  };
}
