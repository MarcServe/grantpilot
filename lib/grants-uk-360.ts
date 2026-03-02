/**
 * UK grants from 360Giving API (live data, updated daily). No API key required.
 * Fetches grants_made from major UK funders to reach up to 500 opportunities.
 */

import type { GrantInput } from "@/lib/grants-ingest";

const API_BASE = "https://api.threesixtygiving.org/api/v1";
const GRANTNAV_GRANT = "https://grantnav.threesixtygiving.org/grant/";
const MAX_UK_GRANTS = 500;
const PER_FUNDER_LIMIT = 200;

/** Major UK funders (org_id from 360Giving) – grants_made returns recent awards. */
const UK_FUNDER_ORG_IDS = [
  "GB-CHC-1036733",   // Arts Council England
  "GB-CHC-1048993",   // National Lottery Community Fund
  "GB-CHC-1157364",   // National Lottery Heritage Fund
  "GB-GOR-DA1020",    // Scottish Government
  "GB-CHC-1086516",   // Bedfordshire and Luton Community Foundation
  "GB-CHC-1126147",   // Access to Justice Foundation
  "GB-CHC-258583",    // The Baring Foundation
  "GB-CHC-1115476",   // Barrow Cadbury Trust
  "GB-CHC-1166335",   // Barking & Dagenham Giving
  "GB-CHC-311585",    // The Bell Foundation
  "GB-LAE-BIR",       // Birmingham City Council
  "GB-CHC-248031",    // Allen Lane Foundation
  "GB-CHC-1000147",   // A B Charitable Trust
  "GB-CHC-292930",    // Alan & Babette Sainsbury Charitable Fund
  "GB-CHC-266780",    // Architectural Heritage Fund
  "GB-CHC-263294",    // The AIM Foundation
  "GB-CHC-1076925",   // Brian Mercer Trust
  "GB-CHC-1162855",   // Barnwood Trust
  "GB-CHC-1145887",   // Backstage Trust
  "GB-CHC-802623",    // Aurora Trust
  "GB-CHC-1164883",   // 360 Giving (recipient; has grants_received)
  "GB-CHC-1075920",   // Indigo Trust
  "GB-CHC-1015648",   // Andrew Lloyd Webber Foundation
  "GB-CHC-1121739",   // The Ballinger Charitable Trust
  "GB-CHC-1142413",   // The Badur Foundation
  "GB-CHC-1152596",   // The Berkeley Foundation
  "GB-CHC-1113562",   // The Bishop Radford Trust
  "GB-CHC-1164021",   // The Blagrave Trust
  "GB-LAE-BNE",       // London Borough of Barnet
  "GB-CHC-1179847",   // Alex Ferry Foundation
];

interface ThreeSixtyGrant {
  grant_id: string;
  data?: {
    id?: string;
    title?: string;
    amountAwarded?: number;
    awardDate?: string;
    description?: string;
    url?: string;
    fundingOrganization?: Array<{ name?: string }>;
    grantProgramme?: Array<{ url?: string; title?: string }>;
  };
}

interface ThreeSixtyResponse {
  count?: number;
  next?: string;
  results?: ThreeSixtyGrant[];
}

function map360GrantToInput(g: ThreeSixtyGrant): GrantInput | null {
  const data = g.data;
  if (!data) return null;
  const title = data.title?.trim();
  const funder = data.fundingOrganization?.[0]?.name?.trim();
  if (!title || !funder) return null;

  const grantId = g.grant_id || data.id || "";
  const programmeUrl = data.grantProgramme?.[0]?.url;
  const applicationUrl = programmeUrl || data.url || (grantId ? `${GRANTNAV_GRANT}${encodeURIComponent(grantId)}` : "");

  let deadline: string | null = null;
  if (typeof data.awardDate === "string") {
    const d = new Date(data.awardDate);
    if (!isNaN(d.getTime())) deadline = d.toISOString().slice(0, 10);
  }

  return {
    externalId: `uk-360g-${String(grantId).replace(/\s+/g, "-")}`,
    name: title,
    funder,
    amount: typeof data.amountAwarded === "number" ? data.amountAwarded : null,
    deadline,
    applicationUrl: applicationUrl || "https://grantnav.threesixtygiving.org/",
    eligibility: (data.description?.slice(0, 500) as string) || "See 360Giving / funder for eligibility.",
    sectors: [],
    regions: ["England", "Wales", "Scotland", "Northern Ireland"],
    funderLocations: ["UK"],
  };
}

async function fetchGrantsMade(orgId: string, limit: number, offset: number): Promise<ThreeSixtyGrant[]> {
  const url = `${API_BASE}/org/${encodeURIComponent(orgId)}/grants_made/?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as ThreeSixtyResponse;
  return Array.isArray(json.results) ? json.results : [];
}

/**
 * Fetch up to MAX_UK_GRANTS (500) from 360Giving API across major UK funders.
 * New data is available daily from the 360Giving Datastore.
 */
export async function fetchGrantsFrom360Giving(maxTotal = MAX_UK_GRANTS): Promise<GrantInput[]> {
  const seen = new Set<string>();
  const out: GrantInput[] = [];

  for (const orgId of UK_FUNDER_ORG_IDS) {
    if (out.length >= maxTotal) break;
    let offset = 0;
    let hasMore = true;
    while (hasMore && out.length < maxTotal) {
      await new Promise((r) => setTimeout(r, 150)); // gentle on 360Giving API
      const batch = await fetchGrantsMade(orgId, Math.min(PER_FUNDER_LIMIT, 100), offset);
      for (const g of batch) {
        const id = g.grant_id || (g.data as { id?: string })?.id;
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        const mapped = map360GrantToInput(g);
        if (mapped) out.push(mapped);
        if (out.length >= maxTotal) break;
      }
      if (batch.length < 100) hasMore = false;
      else offset += batch.length;
    }
  }
  return out.slice(0, maxTotal);
}
