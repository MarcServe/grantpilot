/**
 * Multi-source grant discovery: OpenAI web search first, Perplexity, then optional
 * Claude and Gemini finders when explicitly enabled; validate every URL before upserting.
 * Regardless of finder source, customer-facing matching and notifications flow through
 * the OpenAI eligibility checker.
 */

import type { DiscoveryProfile } from "./grants-discovery-types";
import { discoverGrantsWithOpenAI } from "./grants-discovery-openai";
import { discoverGrantsWithPerplexity } from "./grants-discovery-perplexity";
import { discoverGrantsWithClaude } from "./grants-discovery-claude";
import { discoverGrantsWithGemini } from "./grants-discovery-gemini";
import { upsertGrant, type GrantInput } from "./grants-ingest";
import { checkUrlHealth } from "./url-health-check";
import { inferFunderLocationsFromProfile } from "@/lib/constants";

export const DISCOVERY_PROVIDER_NAMES = ["openai", "perplexity", "claude", "gemini"] as const;
export type DiscoveryProviderName = (typeof DISCOVERY_PROVIDER_NAMES)[number];

export type DiscoveryProviderStats = {
  raw: number;
  accepted: number;
  created: number;
  updated: number;
  duplicate: number;
  rejected: number;
  errors: number;
  errorSamples: string[];
};

export type DiscoveryProviderStatsMap = Record<DiscoveryProviderName, DiscoveryProviderStats>;

function emptyDiscoveryProviderStats(): DiscoveryProviderStats {
  return {
    raw: 0,
    accepted: 0,
    created: 0,
    updated: 0,
    duplicate: 0,
    rejected: 0,
    errors: 0,
    errorSamples: [],
  };
}

export function createDiscoveryProviderStatsMap(): DiscoveryProviderStatsMap {
  return {
    openai: emptyDiscoveryProviderStats(),
    perplexity: emptyDiscoveryProviderStats(),
    claude: emptyDiscoveryProviderStats(),
    gemini: emptyDiscoveryProviderStats(),
  };
}

export function mergeDiscoveryProviderStats(
  target: DiscoveryProviderStatsMap,
  incoming?: Partial<Record<DiscoveryProviderName, Partial<DiscoveryProviderStats>>> | null
): DiscoveryProviderStatsMap {
  if (!incoming) return target;

  for (const provider of DISCOVERY_PROVIDER_NAMES) {
    const source = incoming[provider];
    if (!source) continue;
    target[provider].raw += Number(source.raw ?? 0);
    target[provider].accepted += Number(source.accepted ?? 0);
    target[provider].created += Number(source.created ?? 0);
    target[provider].updated += Number(source.updated ?? 0);
    target[provider].duplicate += Number(source.duplicate ?? 0);
    target[provider].rejected += Number(source.rejected ?? 0);
    target[provider].errors += Number(source.errors ?? 0);
    const samples = Array.isArray(source.errorSamples) ? source.errorSamples : [];
    target[provider].errorSamples.push(...samples.slice(0, 3));
    target[provider].errorSamples = target[provider].errorSamples.slice(0, 5);
  }

  return target;
}

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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 280);
  if (typeof error === "string") return error.slice(0, 280);
  try {
    return JSON.stringify(error).slice(0, 280);
  } catch {
    return "Unknown provider error";
  }
}

/**
 * Run OpenAI (web search), Perplexity, and explicitly enabled optional providers in parallel.
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
  providerStats: DiscoveryProviderStatsMap;
}> {
  const providerStats = createDiscoveryProviderStatsMap();
  const safe = async (fn: () => Promise<GrantInput[]>, label: DiscoveryProviderName): Promise<GrantInput[]> => {
    try {
      const rows = await fn();
      providerStats[label].raw = rows.length;
      return rows;
    } catch (err) {
      const message = errorMessage(err);
      providerStats[label].errors += 1;
      providerStats[label].errorSamples.push(message);
      console.warn(`[grants-discovery] ${label} failed:`, err);
      return [];
    }
  };

  const [openaiGrants, perplexityGrants, claudeGrants, geminiGrants] = await Promise.all([
    safe(() => discoverGrantsWithOpenAI(profile), "openai"),
    safe(() => discoverGrantsWithPerplexity(profile), "perplexity"),
    safe(() => discoverGrantsWithClaude(profile), "claude"),
    safe(() => discoverGrantsWithGemini(profile), "gemini"),
  ]);

  console.log(
    `[grants-discovery] raw results: openai=${openaiGrants.length}, perplexity=${perplexityGrants.length}, claude=${claudeGrants.length}, gemini=${geminiGrants.length}`
  );

  // Prefer OpenAI > Perplexity > Claude > Gemini when sources find the same grant.
  // All source rows later flow through OpenAI eligibility scoring before becoming trusted matches.
  const byKey = new Map<string, GrantInput>();
  const addCandidate = (g: GrantInput, source: DiscoveryProviderName) => {
    const key = normaliseKey(g);
    if (byKey.has(key)) {
      providerStats[source].duplicate += 1;
      return;
    }
    byKey.set(key, { ...g, externalId: discoveryExternalId(key), source });
  };

  for (const g of openaiGrants) addCandidate(g, "openai");
  for (const g of perplexityGrants) addCandidate(g, "perplexity");
  for (const g of claudeGrants) addCandidate(g, "claude");
  for (const g of geminiGrants) addCandidate(g, "gemini");

  let created = 0;
  let updated = 0;
  let rejected = 0;

  for (const g of byKey.values()) {
    const source = DISCOVERY_PROVIDER_NAMES.includes(g.source as DiscoveryProviderName)
      ? (g.source as DiscoveryProviderName)
      : "openai";

    try {
      const health = await checkUrlHealth(g.applicationUrl, g);
      if (health.status === "dead") {
        console.warn(`[grants-discovery] REJECTED (dead URL): ${g.name} — ${g.applicationUrl} (${health.reason})`);
        providerStats[source].rejected += 1;
        rejected++;
        continue;
      }
      if (health.status === "expired") {
        console.warn(`[grants-discovery] REJECTED (expired): ${g.name} — ${g.applicationUrl}`);
        providerStats[source].rejected += 1;
        rejected++;
        continue;
      }

      const loginWalled = await isLoginWalled(g.applicationUrl);
      if (loginWalled) {
        g.eligibility = `${g.eligibility}\n\nApplication access: sign-in or portal account required. GrantsCopilot can prepare the profile, documents, reminders, and draft answers, then pause for the user to sign in.`;
      }

      const { created: c } = await upsertGrant(g);
      providerStats[source].accepted += 1;
      if (c) {
        created++;
        providerStats[source].created += 1;
      } else {
        updated++;
        providerStats[source].updated += 1;
      }
      console.log(`[grants-discovery] ${c ? "CREATED" : "UPDATED"}: ${g.name} (${g.source}) — ${g.applicationUrl}`);
    } catch (e) {
      providerStats[source].errors += 1;
      providerStats[source].errorSamples.push(errorMessage(e));
      providerStats[source].errorSamples = providerStats[source].errorSamples.slice(0, 5);
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
    providerStats,
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
    funderLocations: inferFunderLocationsFromProfile(profile) as ("US" | "UK" | "EU" | "CA" | "AU" | "Global")[],
  };
}
