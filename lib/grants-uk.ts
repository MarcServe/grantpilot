/**
 * UK grant discovery: live data from Find a Grant (find-government-grants.service.gov.uk).
 * The site is a Next.js app that embeds grant data in __NEXT_DATA__.
 * No API key required — public government data.
 */

import type { GrantInput } from "@/lib/grants-ingest";

const FIND_A_GRANT_URL = "https://www.find-government-grants.service.gov.uk/grants";
const FIND_A_GRANT_DETAIL = "https://www.find-government-grants.service.gov.uk/grants";

interface FindAGrantEntry {
  id?: string;
  label?: string;
  grantName?: string;
  grantFunder?: string;
  grantShortDescription?: string;
  grantMaximumAward?: number;
  grantMinimumAward?: number;
  grantApplicationCloseDate?: string;
  grantApplicationOpenDate?: string;
  grantLocation?: string[];
  grantApplicantType?: string[];
}

function mapToGrantInput(entry: FindAGrantEntry): GrantInput | null {
  const name = entry.grantName?.trim();
  const funder = entry.grantFunder?.trim();
  if (!name || !funder) return null;

  const slug = entry.label || entry.id || name.replace(/\s+/g, "-").toLowerCase().slice(0, 60);
  const applicationUrl = `${FIND_A_GRANT_DETAIL}/${slug}`;

  let deadline: string | null = null;
  if (entry.grantApplicationCloseDate) {
    const d = new Date(entry.grantApplicationCloseDate);
    if (!isNaN(d.getTime())) deadline = d.toISOString().slice(0, 10);
  }

  const amount = entry.grantMaximumAward ?? null;
  const applicantTypes = entry.grantApplicantType ?? [];
  const description = entry.grantShortDescription ?? null;

  const eligibilityParts: string[] = [];
  if (applicantTypes.length) {
    eligibilityParts.push(`Applicant types: ${applicantTypes.join(", ")}.`);
  }
  if (description) {
    eligibilityParts.push(description);
  }

  const objectiveParts: string[] = [];
  if (entry.grantMinimumAward != null && amount != null) {
    objectiveParts.push(`Award range: £${entry.grantMinimumAward.toLocaleString("en-GB")} – £${amount.toLocaleString("en-GB")}.`);
  }
  if (entry.grantApplicationOpenDate) {
    objectiveParts.push(`Open since: ${new Date(entry.grantApplicationOpenDate).toLocaleDateString("en-GB")}.`);
  }

  return {
    externalId: `uk-fag-${slug}`,
    name,
    funder,
    amount,
    deadline,
    applicationUrl,
    eligibility: eligibilityParts.join(" ") || "See Find a Grant for eligibility and how to apply.",
    description,
    objectives: objectiveParts.length > 0 ? objectiveParts.join(" ") : null,
    applicantTypes,
    sectors: [],
    regions: entry.grantLocation?.length ? entry.grantLocation : ["England"],
    funderLocations: ["UK"],
    source: "default",
  };
}

/**
 * Scrape the Find a Grant search page and extract grant data from __NEXT_DATA__.
 */
async function fetchFromFindAGrant(): Promise<GrantInput[]> {
  const res = await fetch(`${FIND_A_GRANT_URL}?searchTerm=&limit=200`, {
    headers: { "User-Agent": "Grants-Copilot/1.0 (grant aggregator)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Find a Grant returned ${res.status}`);

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Could not find __NEXT_DATA__ in Find a Grant page");

  const nextData = JSON.parse(match[1]);
  const entries: FindAGrantEntry[] = nextData?.props?.pageProps?.searchResult ?? [];

  const now = new Date();
  const grants: GrantInput[] = [];
  for (const entry of entries) {
    const g = mapToGrantInput(entry);
    if (!g) continue;
    if (g.deadline && new Date(g.deadline) < now) continue;
    grants.push(g);
  }
  return grants;
}

/**
 * Fetch UK grants from Find a Grant (live government data).
 */
export async function fetchGrantsFromUK(): Promise<GrantInput[]> {
  try {
    const grants = await fetchFromFindAGrant();
    if (grants.length > 0) return grants;
  } catch (err) {
    console.error("[grants-uk] Find a Grant fetch failed:", err);
  }
  return [];
}
