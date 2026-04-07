/**
 * Multi-agent grant discovery: OpenAI (web search), Perplexity Sonar, Claude, Gemini
 * in parallel; merge with preference OpenAI > Perplexity > Claude > Gemini;
 * validate every URL before upserting.
 */

import type { DiscoveryProfile } from "./grants-discovery-types";
import { discoverGrantsWithClaude } from "./grants-discovery-claude";
import { discoverGrantsWithOpenAI } from "./grants-discovery-openai";
import { discoverGrantsWithPerplexity } from "./grants-discovery-perplexity";
import { discoverGrantsWithGemini } from "./grants-discovery-gemini";
import { upsertGrant, type GrantInput } from "./grants-ingest";
import { checkUrlHealth } from "./url-health-check";

function normaliseKey(g: GrantInput): string {
  return `${(g.name ?? "").toLowerCase().trim()}|${(g.funder ?? "").toLowerCase().trim()}`;
}

function discoveryExternalId(key: string): string {
  const slug = key.replace(/\|/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 80);
  return `discovery-${slug}`;
}

const LOGIN_PAGE_PATTERNS = [
  /sign\s*in/i, /log\s*in/i, /login/i, /create\s*an?\s*account/i,
  /register\s*(to|for)/i, /government\s*gateway/i, /one\s*login/i,
];

/**
 * Check if a URL returns a login/registration page (not directly accessible).
 */
async function isLoginWalled(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    clearTimeout(timeout);
    const html = await res.text();
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .slice(0, 3000)
      .toLowerCase();
    const hasPasswordField = html.includes('type="password"') || html.includes("type='password'");
    if (hasPasswordField) return true;
    const loginMatches = LOGIN_PAGE_PATTERNS.filter((p) => p.test(bodyText));
    return loginMatches.length >= 2 && bodyText.length < 5000;
  } catch {
    return false;
  }
}

/**
 * Run OpenAI (web search, primary), Claude, and Gemini in parallel.
 * Merge, dedupe, validate URLs, then upsert only verified grants.
 */
export async function runDiscoveryAndUpsert(profile: DiscoveryProfile): Promise<{
  claude: number;
  openai: number;
  perplexity: number;
  gemini: number;
  created: number;
  updated: number;
  rejected: number;
}> {
  const safe = <T>(fn: () => Promise<T[]>, label: string): Promise<T[]> =>
    fn().catch((err) => {
      console.warn(`[grants-discovery] ${label} failed:`, err);
      return [] as T[];
    });

  const [openaiGrants, perplexityGrants, claudeGrants, geminiGrants] = await Promise.all([
    safe(() => discoverGrantsWithOpenAI(profile), "openai"),
    safe(() => discoverGrantsWithPerplexity(profile), "perplexity"),
    safe(() => discoverGrantsWithClaude(profile), "claude"),
    safe(() => discoverGrantsWithGemini(profile), "gemini"),
  ]);

  console.log(
    `[grants-discovery] raw results: openai=${openaiGrants.length}, perplexity=${perplexityGrants.length}, claude=${claudeGrants.length}, gemini=${geminiGrants.length}`
  );

  // Prefer OpenAI > Perplexity (web-grounded) > Claude > Gemini
  const byKey = new Map<string, GrantInput>();
  for (const g of openaiGrants) {
    const key = normaliseKey(g);
    byKey.set(key, { ...g, externalId: discoveryExternalId(key), source: "openai" });
  }
  for (const g of perplexityGrants) {
    const key = normaliseKey(g);
    if (!byKey.has(key))
      byKey.set(key, { ...g, externalId: discoveryExternalId(key), source: "perplexity" });
  }
  for (const g of claudeGrants) {
    const key = normaliseKey(g);
    if (!byKey.has(key))
      byKey.set(key, { ...g, externalId: discoveryExternalId(key), source: "claude" });
  }
  for (const g of geminiGrants) {
    const key = normaliseKey(g);
    if (!byKey.has(key))
      byKey.set(key, { ...g, externalId: discoveryExternalId(key), source: "gemini" });
  }

  let created = 0;
  let updated = 0;
  let rejected = 0;

  for (const g of byKey.values()) {
    try {
      const health = await checkUrlHealth(g.applicationUrl);
      if (health.status === "dead") {
        console.warn(`[grants-discovery] REJECTED (dead URL): ${g.name} — ${g.applicationUrl} (${health.reason})`);
        rejected++;
        continue;
      }
      if (health.status === "expired") {
        console.warn(`[grants-discovery] REJECTED (expired): ${g.name} — ${g.applicationUrl}`);
        rejected++;
        continue;
      }

      const loginWalled = await isLoginWalled(g.applicationUrl);
      if (loginWalled) {
        console.warn(`[grants-discovery] REJECTED (login required): ${g.name} — ${g.applicationUrl}`);
        rejected++;
        continue;
      }

      const { created: c } = await upsertGrant(g);
      if (c) created++;
      else updated++;
      console.log(`[grants-discovery] ${c ? "CREATED" : "UPDATED"}: ${g.name} (${g.source}) — ${g.applicationUrl}`);
    } catch (e) {
      console.warn("[grants-discovery] upsert skip", g.externalId, e);
    }
  }

  console.log(`[grants-discovery] final: ${created} created, ${updated} updated, ${rejected} rejected`);

  return {
    claude: claudeGrants.length,
    openai: openaiGrants.length,
    perplexity: perplexityGrants.length,
    gemini: geminiGrants.length,
    created,
    updated,
    rejected,
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
    funderLocations: (profile.funderLocations ?? []) as ("US" | "UK" | "EU" | "CA" | "AU" | "Global")[],
  };
}
