/**
 * Grant discovery via Perplexity Sonar (web-grounded search + JSON).
 * Uses OpenAI-compatible API at api.perplexity.ai.
 */

import OpenAI from "openai";
import type { DiscoveryProfile, DiscoveryGrantRow } from "./grants-discovery-types";
import { parseJsonArray, toGrantInput } from "./grants-discovery-types";
import type { GrantInput } from "./grants-ingest";

const MODEL = "sonar";
const MAX_GRANTS = 15;

function buildPrompt(profile: DiscoveryProfile): string {
  const regions = profile.funderLocations?.length
    ? profile.funderLocations.join(", ")
    : "UK, EU, and global/international programmes open to UK applicants";
  return `Search the web and list REAL, currently open grant opportunities for this business. Use live search results — only include URLs you can verify from your search.

Business profile:
- Name: ${profile.businessName}
- Sector: ${profile.sector}
- Description: ${profile.description}
- Location: ${profile.location}
- Funding needed: £${profile.fundingMin.toLocaleString("en-GB")} – £${profile.fundingMax.toLocaleString("en-GB")}
- Purposes: ${profile.fundingPurposes.join(", ")}

Regions: ${regions}

Also include global or international grants, accelerators, foundation funds, and corporate programmes only when the page says UK or international applicants can apply. Do not include US-only, Canada-only, or Australia-only grants unless UK applicants are eligible.

PRIORITISE: charity/foundation grants, local authority and LEP funds, small business and startup grants, sector-specific funds, corporate CSR grants, global programmes open to UK applicants, and grants with public application forms (Google Forms, Typeform, Submittable, simple web forms).

EXCLUDE login-only portals: Innovate UK IFS, Find a Grant account-only flows, Grants.gov workspace login as the only path, EU portal login-only.

Return ONLY a JSON array (no markdown). Each object:
- name (string)
- funder (string)
- amount (number or null)
- deadline (string or null) ISO date if known
- applicationUrl (string) — must be a real URL from your search
- eligibility (string)
- sectors (string array)
- regions (string array)
- applicantTypes (string array) if known

Limit ${MAX_GRANTS} grants.`;
}

export async function discoverGrantsWithPerplexity(
  profile: DiscoveryProfile
): Promise<GrantInput[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) return [];

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.perplexity.ai",
  });

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: buildPrompt(profile) }],
    temperature: 0.2,
    max_tokens: 8192,
  });

  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") return [];

  const funderLocations = profile.funderLocations ?? [];

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(jsonStr) as unknown;
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { grants?: unknown }).grants)
        ? (parsed as { grants: unknown[] }).grants
        : [];
    const rows = arr as DiscoveryGrantRow[];
    const out: GrantInput[] = [];
    for (const row of rows) {
      const grant = toGrantInput(row, "perplexity", funderLocations);
      if (grant) out.push(grant);
    }
    console.log(`[grants-discovery-perplexity] ${out.length} grants`);
    return out;
  } catch {
    const fallback = parseJsonArray<DiscoveryGrantRow>(content);
    return fallback
      .map((row) => toGrantInput(row, "perplexity", funderLocations))
      .filter((g): g is GrantInput => g != null);
  }
}
