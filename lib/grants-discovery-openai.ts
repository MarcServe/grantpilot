/**
 * Primary grant discovery via OpenAI Responses API with web_search.
 * Searches the live internet for real grant opportunities with verified URLs.
 */

import OpenAI from "openai";
import type { DiscoveryProfile, DiscoveryGrantRow } from "./grants-discovery-types";
import { parseJsonArray, toGrantInput } from "./grants-discovery-types";
import type { GrantInput } from "./grants-ingest";

const DISCOVERY_MODEL = "gpt-4o-mini";
const MAX_GRANTS = 20;

function buildSearchPrompt(profile: DiscoveryProfile): string {
  const regions = profile.funderLocations?.length
    ? profile.funderLocations.join(", ")
    : "UK, EU, and global/international programmes open to UK applicants";
  return `You are a grant research expert with web search. Search the internet RIGHT NOW to find REAL, currently open grant opportunities for this business.

Business profile:
- Name: ${profile.businessName}
- Sector: ${profile.sector}
- Description: ${profile.description}
- Location: ${profile.location}
- Funding needed: £${profile.fundingMin.toLocaleString("en-GB")} – £${profile.fundingMax.toLocaleString("en-GB")}
- Purposes: ${profile.fundingPurposes.join(", ")}

Search for grants in: ${regions}

Also search for global or international grants, accelerators, foundation funds, and corporate programmes that explicitly accept UK applicants. Do not include US-only, Canada-only, or Australia-only grants unless the page says UK or international applicants can apply.

SEARCH THESE TYPES OF FUNDERS (prioritise direct-access grants):
- Charity and foundation grants (Wellcome Trust, Esmée Fairbairn, Garfield Weston, Paul Hamlyn, Joseph Rowntree, Lloyds Bank Foundation, Big Lottery / National Lottery Community Fund, Arts Council, Sport England, Heritage Fund)
- Local enterprise partnerships and council grants
- Small business grants and startup funds
- Social enterprise and community grants
- Sector-specific funds (tech accelerators, creative industry funds, green energy grants)
- Corporate CSR grants (Google.org, Nesta, Unilever, Barclays Eagle Labs)
- Grant aggregator sites (grantsonline.org.uk, fundingcentral.org.uk, grants4community.org.uk)

PRIORITISE grants where the applicationUrl is a DIRECT application form:
- Google Forms, Airtable, Typeform, Submittable, JotForm, SurveyMonkey Apply
- Simple web forms on the funder's website
- PDF application forms (downloadable)

ALSO INCLUDE login-required government or portal grants when they are live and relevant:
- Innovate UK IFS portal applications
- Find a Grant (gov.uk) portal applications requiring sign-in
- Grants.gov (US) portal applications
- EU funding portal applications
For these, use the real grant/application page URL and mention in eligibility that sign-in is required.

CRITICAL:
- Every applicationUrl MUST be a real URL you found during this web search
- Do NOT fabricate, guess, or recall URLs from memory — only use URLs from search results
- Only include grants that appear currently open for applications
- If you cannot find a direct form URL, use the official grant detail/apply page URL only when it clearly belongs to this specific open grant

Return a JSON array of grant objects. Each must have:
- name (string): exact grant name as shown on the website
- funder (string): organisation name
- amount (number or null): max funding amount if stated
- deadline (string or null): ISO date if stated, e.g. "2026-06-30"
- applicationUrl (string): the REAL URL you found via search (required)
- eligibility (string): short eligibility summary from the page
- sectors (string array): e.g. ["Technology", "Healthcare"]
- regions (string array): e.g. ["England", "UK", "Wales"]
- funderLocations (string array if known): use "Global" for programmes open internationally or to UK applicants beyond a single local region
- applicantTypes (string array): e.g. ["SME", "Charity", "Social Enterprise"]

Find up to ${MAX_GRANTS} grants. Return ONLY the JSON array, no markdown or extra text.`;
}

function extractText(output: unknown[]): string {
  for (const item of output as { type: string; content?: { type: string; text?: string }[] }[]) {
    if (item.type === "message" && item.content) {
      for (const block of item.content) {
        if (block.type === "output_text" && block.text) {
          return block.text;
        }
      }
    }
  }
  return "";
}

export async function discoverGrantsWithOpenAI(
  profile: DiscoveryProfile
): Promise<GrantInput[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return [];

  const openai = new OpenAI({ apiKey });

  const userLocation = profile.funderLocations?.includes("UK")
    ? { type: "approximate" as const, country: "GB" }
    : profile.funderLocations?.includes("US")
      ? { type: "approximate" as const, country: "US" }
      : undefined;

  const webSearchTool: Record<string, unknown> = { type: "web_search_preview" };
  if (userLocation) {
    webSearchTool.user_location = userLocation;
  }

  const response = await openai.responses.create({
    model: DISCOVERY_MODEL,
    tools: [webSearchTool as unknown as OpenAI.Responses.Tool],
    input: buildSearchPrompt(profile),
  });

  const text = extractText(response.output as unknown[]);
  if (!text) {
    console.warn("[grants-discovery-openai] web search returned no text");
    return [];
  }

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
    const rows = arr as DiscoveryGrantRow[];
    const out: GrantInput[] = [];
    for (const row of rows) {
      const grant = toGrantInput(row, "openai", funderLocations);
      if (grant) out.push(grant);
    }
    console.log(`[grants-discovery-openai] web search found ${out.length} grants`);
    return out;
  } catch {
    const fallback = parseJsonArray<DiscoveryGrantRow>(text);
    return fallback
      .map((row) => toGrantInput(row, "openai", funderLocations))
      .filter((g): g is GrantInput => g != null);
  }
}
