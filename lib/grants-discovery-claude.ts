/**
 * Grant discovery via Claude web search.
 */

import type { DiscoveryProfile, DiscoveryGrantRow } from "./grants-discovery-types";
import { parseJsonArray, toGrantInput } from "./grants-discovery-types";
import type { GrantInput } from "./grants-ingest";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_GRANTS = 15;

function buildPrompt(profile: DiscoveryProfile): string {
  const regions = profile.funderLocations?.length
    ? profile.funderLocations.join(", ")
    : "UK, EU, and global/international programmes open to UK applicants";

  return `Use live web search to find REAL, currently open grant opportunities for this business. Only include grants with URLs you found during this search.

Business profile:
- Name: ${profile.businessName}
- Sector: ${profile.sector}
- Description: ${profile.description}
- Location: ${profile.location}
- Funding needed: £${profile.fundingMin.toLocaleString("en-GB")} – £${profile.fundingMax.toLocaleString("en-GB")}
- Purposes: ${profile.fundingPurposes.join(", ")}

Search regions: ${regions}

Prioritise direct-access grants, foundation funds, government grant detail pages, accelerators, corporate CSR programmes, and public application forms. Include login-required government grants only when the grant detail page itself is specific and currently open; mention sign-in requirements in eligibility.

Return ONLY a JSON array. Each object must have:
- name (string)
- funder (string)
- amount (number or null)
- deadline (string or null, ISO date if known)
- applicationUrl (string, a real page found during search)
- eligibility (string)
- sectors (string array)
- regions (string array)
- applicantTypes (string array, if known)

Limit ${MAX_GRANTS} grants. Do not use markdown or explanatory text.`;
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const item = block as { type?: string; text?: string };
      return item.type === "text" && typeof item.text === "string" ? item.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function discoverGrantsWithClaude(
  profile: DiscoveryProfile
): Promise<GrantInput[]> {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY)?.trim();
  if (!apiKey) return [];

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_DISCOVERY_MODEL?.trim() || MODEL,
      max_tokens: 8192,
      temperature: 0.2,
      messages: [{ role: "user", content: buildPrompt(profile) }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Claude discovery failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const payload = (await response.json()) as { content?: unknown };
  const text = extractText(payload.content);
  if (!text) return [];

  const funderLocations = profile.funderLocations ?? [];

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr) as unknown;
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { grants?: unknown }).grants)
        ? (parsed as { grants: unknown[] }).grants
        : [];
    return (arr as DiscoveryGrantRow[])
      .map((row) => toGrantInput(row, "claude", funderLocations))
      .filter((grant): grant is GrantInput => grant != null);
  } catch {
    return parseJsonArray<DiscoveryGrantRow>(text)
      .map((row) => toGrantInput(row, "claude", funderLocations))
      .filter((grant): grant is GrantInput => grant != null);
  }
}
