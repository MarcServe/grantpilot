/**
 * Grant discovery via Anthropic (Claude): default discovery source.
 * Given a business profile, ask the model to list relevant grants (UK/US/EU).
 * Results are tagged source "claude" and upserted.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DiscoveryProfile, DiscoveryGrantRow } from "./grants-discovery-types";
import { parseJsonArray, toGrantInput } from "./grants-discovery-types";
import type { GrantInput } from "./grants-ingest";

const DISCOVERY_MODEL = "claude-sonnet-4-20250514";
const MAX_GRANTS = 15;

function buildPrompt(profile: DiscoveryProfile): string {
  const regions = profile.funderLocations?.length
    ? profile.funderLocations.join(", ")
    : "UK, and if relevant US or EU";
  return `You are a grant research expert. Given this business profile, list real or representative grants that could fit. Focus on ${regions} funders (e.g. Innovate UK, British Business Bank, UK government schemes, or US/EU equivalents if in scope).

Business profile:
- Name: ${profile.businessName}
- Sector: ${profile.sector}
- Description: ${profile.description}
- Location: ${profile.location}
- Funding needed: £${profile.fundingMin.toLocaleString("en-GB")} – £${profile.fundingMax.toLocaleString("en-GB")}
- Purposes: ${profile.fundingPurposes.join(", ")}

Return a JSON array of grant objects. Each object must have:
- name (string): grant or programme name
- funder (string): organisation name
- amount (number or null): max funding amount if known
- deadline (string or null): ISO date e.g. "2026-06-30"
- applicationUrl (string): direct URL to the application form or competition apply page (required). Prefer the actual form URL when known (e.g. Airtable, Typeform, Google Forms) so users and automation open the form directly—not the programme info page. Never use only a funder homepage or generic "for businesses" page. If you only have a programme info URL, use it, but the app can later discover the form link from that page.
- eligibility (string): short eligibility summary
- sectors (string array): e.g. ["Technology", "Healthcare"]
- regions (string array): e.g. ["England", "UK"]
- applicantTypes (string array): eligible applicant/entity types if known, e.g. ["Public Sector", "Non-profit", "Private Sector"] — who can apply. Omit or empty array if unknown.

Use real funder and programme names where possible. Limit to ${MAX_GRANTS} grants. Return only the JSON array, no markdown or explanation.`;
}

export async function discoverGrantsWithClaude(
  profile: DiscoveryProfile
): Promise<GrantInput[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return [];

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: DISCOVERY_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: buildPrompt(profile) }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { grants?: unknown }).grants)
        ? (parsed as { grants: unknown[] }).grants
        : [];
    const rows = arr as DiscoveryGrantRow[];
    const funderLocations = profile.funderLocations ?? [];
    const out: GrantInput[] = [];
    for (const row of rows) {
      const grant = toGrantInput(row, "claude", funderLocations);
      if (grant) out.push(grant);
    }
    return out;
  } catch {
    const fallback = parseJsonArray<DiscoveryGrantRow>(text);
    const funderLocations = profile.funderLocations ?? [];
    return fallback
      .map((row) => toGrantInput(row, "claude", funderLocations))
      .filter((g): g is GrantInput => g != null);
  }
}
