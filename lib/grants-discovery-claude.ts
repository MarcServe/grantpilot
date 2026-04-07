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
  return `You are a grant research expert. List REAL grants that currently exist and are open for this business. Focus on ${regions}.

Business profile:
- Name: ${profile.businessName}
- Sector: ${profile.sector}
- Description: ${profile.description}
- Location: ${profile.location}
- Funding needed: £${profile.fundingMin.toLocaleString("en-GB")} – £${profile.fundingMax.toLocaleString("en-GB")}
- Purposes: ${profile.fundingPurposes.join(", ")}

PRIORITISE these funder types (direct-access grants with public application forms):
- Charity and foundation grants (Wellcome Trust, Esmée Fairbairn, Garfield Weston, Paul Hamlyn, National Lottery Community Fund, Arts Council, Sport England, Heritage Fund, Lloyds Bank Foundation)
- Local enterprise partnerships and council grants
- Small business and startup funds
- Social enterprise and community grants
- Sector-specific funds (tech, creative industry, green energy)
- Corporate CSR grants (Google.org, Nesta, Unilever, Barclays)

EXCLUDE (require portal login, cannot be directly applied to):
- Innovate UK IFS portal
- Find a Grant (gov.uk) portal
- Grants.gov (US) portal
- EU funding portal

CRITICAL RULES:
- Only include grants you are confident actually exist as real programmes
- The applicationUrl must be a real, specific page for that grant — not a homepage or generic listing page
- Prefer direct form URLs (Google Forms, Typeform, Submittable, simple web forms)
- Do NOT invent or guess URLs — if unsure of the exact URL, use the funder's grant programme page
- Only include grants that are likely currently open

Return a JSON array. Each object must have:
- name (string): exact grant/programme name
- funder (string): organisation name
- amount (number or null): max funding if known
- deadline (string or null): ISO date e.g. "2026-06-30"
- applicationUrl (string): real URL for this specific grant (required)
- eligibility (string): short summary
- sectors (string array): e.g. ["Technology", "Healthcare"]
- regions (string array): e.g. ["England", "UK"]
- applicantTypes (string array): e.g. ["SME", "Charity", "Social Enterprise"]

Limit to ${MAX_GRANTS} grants. Return ONLY the JSON array.`;
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
