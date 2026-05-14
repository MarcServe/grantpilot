/**
 * Grant discovery via Google Gemini: given a business profile, ask the model to list
 * relevant grants, including global programmes open to UK applicants. Results are tagged source "gemini" and upserted.
 */

import { GoogleGenAI } from "@google/genai";
import type { DiscoveryProfile, DiscoveryGrantRow } from "./grants-discovery-types";
import { parseJsonArray, toGrantInput } from "./grants-discovery-types";
import type { GrantInput } from "./grants-ingest";

const DISCOVERY_MODEL = "gemini-2.0-flash";
const MAX_GRANTS = 15;

function buildPrompt(profile: DiscoveryProfile): string {
  const regions = profile.funderLocations?.length
    ? profile.funderLocations.join(", ")
    : "UK, EU, and global/international programmes open to UK applicants";
  return `You are a grant research expert. List REAL grants that currently exist and are open for this business. Focus on ${regions}.

Business profile:
- Name: ${profile.businessName}
- Sector: ${profile.sector}
- Description: ${profile.description}
- Location: ${profile.location}
- Funding needed: £${profile.fundingMin.toLocaleString("en-GB")} – £${profile.fundingMax.toLocaleString("en-GB")}
- Purposes: ${profile.fundingPurposes.join(", ")}

Also include global or international grants, accelerators, foundation funds, and corporate programmes only when UK or international applicants can apply. Do not include US-only, Canada-only, or Australia-only grants unless UK applicants are eligible.

PRIORITISE these funder types (direct-access grants with public forms):
- Charity and foundation grants (Wellcome Trust, Esmée Fairbairn, Garfield Weston, Paul Hamlyn, National Lottery Community Fund, Arts Council, Sport England, Heritage Fund, Lloyds Bank Foundation)
- Local enterprise partnerships and council grants
- Small business and startup funds
- Social enterprise and community grants
- Sector-specific funds (tech, creative industry, green energy)
- Corporate CSR grants (Google.org, Nesta, Unilever, Barclays)

EXCLUDE (require portal login):
- Innovate UK IFS portal
- Find a Grant (gov.uk) portal
- Grants.gov (US) portal
- EU funding portal

CRITICAL: Only include grants you are confident actually exist. The applicationUrl must be a real page for that specific grant — not a homepage. Prefer direct application forms (Google Forms, Typeform, Submittable). Do NOT fabricate URLs.

Return a JSON array. Each object must have:
- name (string): exact grant/programme name
- funder (string): organisation name
- amount (number or null): max funding if known
- deadline (string or null): ISO date e.g. "2026-06-30"
- applicationUrl (string): real URL for this grant (required)
- eligibility (string): short summary
- sectors (string array): e.g. ["Technology"]
- regions (string array): e.g. ["England", "UK"]
- applicantTypes (string array): e.g. ["SME", "Charity"]

Limit to ${MAX_GRANTS} grants. Return ONLY the JSON array.`;
}

export async function discoverGrantsWithGemini(
  profile: DiscoveryProfile
): Promise<GrantInput[]> {
  const apiKey = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY)?.trim();
  if (!apiKey) return [];

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: DISCOVERY_MODEL,
    contents: buildPrompt(profile),
  });

  const text = typeof (response as { text?: string }).text === "string"
    ? (response as { text: string }).text
    : "";
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
      const grant = toGrantInput(row, "gemini", funderLocations);
      if (grant) out.push(grant);
    }
    return out;
  } catch {
    const fallback = parseJsonArray<DiscoveryGrantRow>(text);
    const funderLocations = profile.funderLocations ?? [];
    return fallback
      .map((row) => toGrantInput(row, "gemini", funderLocations))
      .filter((g): g is GrantInput => g != null);
  }
}
