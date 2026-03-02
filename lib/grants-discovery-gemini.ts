/**
 * Grant discovery via Google Gemini: given a business profile, ask the model to list
 * relevant grants (UK/US/EU). Results are tagged source "gemini" and upserted.
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
- applicationUrl (string): URL to apply or find out more (required)
- eligibility (string): short eligibility summary
- sectors (string array): e.g. ["Technology", "Healthcare"]
- regions (string array): e.g. ["England", "UK"]

Use real funder and programme names where possible. Limit to ${MAX_GRANTS} grants. Return only the JSON array, no markdown or explanation.`;
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
