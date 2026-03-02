/**
 * Real-time grant discovery from Grants.gov (US federal opportunities).
 * No API key required. Used when GRANTS_FEED_URL is not set or to supplement feed.
 */

import type { GrantInput } from "@/lib/grants-ingest";

const GRANTS_GOV_SEARCH_URL = "https://api.grants.gov/v1/api/search2";
const GRANTS_GOV_DETAIL_BASE = "https://www.grants.gov/search-results-detail";

interface GrantsGovOppHit {
  id: string;
  number?: string;
  title?: string;
  agency?: string;
  openDate?: string;
  closeDate?: string;
  oppStatus?: string;
  docType?: string;
  cfdaList?: string[];
}

interface GrantsGovSearchResponse {
  errorcode?: number;
  data?: {
    oppHits?: GrantsGovOppHit[];
    hitCount?: number;
  };
}

function parseUSDate(s: string | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  const [mm, dd, yyyy] = s.split("/");
  if (!mm || !dd || !yyyy) return null;
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Map a single Grants.gov opportunity hit to our GrantInput.
 */
export function mapGrantsGovHitToGrant(hit: GrantsGovOppHit): GrantInput | null {
  const title = hit.title?.trim();
  const agency = hit.agency?.trim();
  if (!title || !agency) return null;

  const id = String(hit.id ?? "");
  const applicationUrl = id ? `${GRANTS_GOV_DETAIL_BASE}/${id}` : "";

  return {
    externalId: `grants-gov-${id}`,
    name: title,
    funder: agency,
    amount: null,
    deadline: parseUSDate(hit.closeDate),
    applicationUrl,
    eligibility: "See Grants.gov for full eligibility and application details.",
    sectors: [],
    regions: [],
    funderLocations: ["US"],
  };
}

const ROWS_PER_PAGE = 100; // API max
const MAX_TOTAL_US = 500;  // cap total US grants per sync

/**
 * Fetch one page of open (posted) opportunities from Grants.gov.
 */
async function fetchGrantsGovPage(startRecord: number, rows: number): Promise<{ hits: GrantsGovOppHit[]; hitCount: number }> {
  const res = await fetch(GRANTS_GOV_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows: Math.min(rows, ROWS_PER_PAGE),
      startRecordNum: startRecord,
      oppStatuses: "posted",
      resultType: "json",
    }),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Grants.gov API failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as GrantsGovSearchResponse;
  if (json.errorcode !== 0) throw new Error("Grants.gov search returned an error.");
  const hits = json.data?.oppHits ?? [];
  const hitCount = json.data?.hitCount ?? 0;
  return { hits, hitCount };
}

/**
 * Fetch open (posted) opportunities from Grants.gov with pagination. Returns up to maxTotal (default 500).
 */
export async function fetchGrantsFromGrantsGov(maxTotal = MAX_TOTAL_US): Promise<GrantInput[]> {
  const out: GrantInput[] = [];
  let startRecord = 0;
  const limit = Math.min(Math.max(maxTotal, 1), 1000);

  while (startRecord < limit) {
    const { hits, hitCount } = await fetchGrantsGovPage(startRecord, ROWS_PER_PAGE);
    for (const hit of hits) {
      const g = mapGrantsGovHitToGrant(hit);
      if (g) out.push(g);
      if (out.length >= limit) break;
    }
    if (hits.length === 0 || out.length >= limit) break;
    startRecord += ROWS_PER_PAGE;
    if (startRecord >= hitCount) break;
  }
  return out.slice(0, limit);
}
