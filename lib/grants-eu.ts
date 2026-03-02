/**
 * EU grant discovery: live data from the EU Funding & Tenders Portal (SEDIA API).
 * No API key registration required — uses the public SEDIA search endpoint.
 * Falls back to a minimal curated list only if the API is unreachable.
 */

import type { GrantInput } from "@/lib/grants-ingest";

const SEDIA_SEARCH = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const PORTAL_BASE = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details";
const PAGE_SIZE = 100;
const MAX_EU_GRANTS = 500;

const STATUS_OPEN_OR_FORTHCOMING = ["31094501", "31094502"];
const TYPE_GRANTS = ["1", "2", "8"];

interface SEDIAResult {
  url?: string;
  metadata?: Record<string, string[]>;
}

interface SEDIAResponse {
  totalResults?: number;
  results?: SEDIAResult[];
}

function extractDeadline(meta: Record<string, string[]>): string | null {
  const raw = meta.deadlineDate?.[0];
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  if (d < new Date()) {
    try {
      const budget = JSON.parse(meta.budgetOverview?.[0] ?? "{}");
      const topics: Record<string, { deadlineDates?: string[] }[]> = budget.budgetTopicActionMap ?? {};
      for (const actions of Object.values(topics)) {
        for (const a of actions) {
          const dates = (a.deadlineDates ?? []).map((s: string) => new Date(s)).filter((dt: Date) => !isNaN(dt.getTime()) && dt > new Date());
          if (dates.length > 0) {
            dates.sort((a: Date, b: Date) => a.getTime() - b.getTime());
            return dates[0].toISOString().slice(0, 10);
          }
        }
      }
    } catch { /* ignore */ }
    return null;
  }
  return d.toISOString().slice(0, 10);
}

function extractMaxAmount(meta: Record<string, string[]>): number | null {
  try {
    const budget = JSON.parse(meta.budgetOverview?.[0] ?? "{}");
    const topics: Record<string, { maxContribution?: number }[]> = budget.budgetTopicActionMap ?? {};
    let max = 0;
    for (const actions of Object.values(topics)) {
      for (const a of actions) {
        if (typeof a.maxContribution === "number" && a.maxContribution > max) max = a.maxContribution;
      }
    }
    return max > 0 ? max : null;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim();
}

function buildDescription(meta: Record<string, string[]>): string | null {
  const parts: string[] = [];

  const rawDesc = meta.description?.[0];
  if (rawDesc) parts.push(stripHtml(rawDesc).slice(0, 1000));

  const keywords = (meta.keywords ?? []).filter((k) => !k.startsWith("HORIZON") && !k.startsWith("DIGITAL") && !k.startsWith("CERV") && !k.startsWith("ERC") && k.length > 3);
  if (keywords.length > 0) parts.push(`Keywords: ${keywords.join(", ")}.`);

  const priorities = meta.crossCuttingPriorities ?? [];
  if (priorities.length > 0) parts.push(`Priorities: ${priorities.join(", ")}.`);

  const callTitle = meta.callTitle?.[0];
  if (callTitle && callTitle !== meta.title?.[0]) parts.push(`Call: ${callTitle}.`);

  return parts.length > 0 ? parts.join("\n\n") : null;
}

function buildObjectives(meta: Record<string, string[]>): string | null {
  const conditions = meta.topicConditions?.[0];
  if (!conditions) return null;
  const clean = stripHtml(conditions).slice(0, 2000);
  return clean || null;
}

function extractSectors(meta: Record<string, string[]>): string[] {
  const keywords = meta.keywords ?? [];
  const sectors: string[] = [];
  for (const k of keywords) {
    if (k.includes(",") || k.length > 60 || k.startsWith("HORIZON") || k.startsWith("DIGITAL") || k.startsWith("CERV")) continue;
    sectors.push(k);
  }
  return sectors.slice(0, 10);
}

function mapSEDIAResultToGrant(r: SEDIAResult): GrantInput | null {
  const meta = r.metadata;
  if (!meta) return null;
  const title = meta.title?.[0]?.trim();
  if (!title) return null;

  const identifier = meta.identifier?.[0] ?? "";
  const portalUrl = identifier
    ? `${PORTAL_BASE}/${identifier}`
    : r.url ?? "https://ec.europa.eu/info/funding-tenders/opportunities/portal/";
  const deadline = extractDeadline(meta);

  const actionType = meta.typesOfAction?.[0] ?? "";
  const callTitle = meta.callTitle?.[0] ?? "";
  const eligibilityParts = [actionType, callTitle].filter(Boolean);

  return {
    externalId: `eu-sedia-${identifier || title.replace(/\s+/g, "-").toLowerCase().slice(0, 50)}`,
    name: title,
    funder: "European Commission",
    amount: extractMaxAmount(meta),
    deadline,
    applicationUrl: portalUrl,
    eligibility: eligibilityParts.join(" — ") || "See EU Funding & Tenders Portal for eligibility.",
    description: buildDescription(meta),
    objectives: buildObjectives(meta),
    sectors: extractSectors(meta),
    regions: ["European Union"],
    funderLocations: ["EU"],
    source: "default",
  };
}

async function fetchSEDIAPage(pageNum: number, pageSize: number): Promise<SEDIAResponse> {
  const url = new URL(SEDIA_SEARCH);
  url.searchParams.set("apiKey", "SEDIA");
  url.searchParams.set("text", "***");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("pageNumber", String(pageNum));

  const query = {
    bool: {
      must: [
        { terms: { type: TYPE_GRANTS } },
        { terms: { status: STATUS_OPEN_OR_FORTHCOMING } },
      ],
    },
  };

  const form = new FormData();
  form.append("query", new Blob([JSON.stringify(query)], { type: "application/json" }));
  form.append("sort", new Blob([JSON.stringify({ field: "deadlineDate", order: "ASC" })], { type: "application/json" }));
  form.append("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }));

  const res = await fetch(url.toString(), { method: "POST", body: form, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`SEDIA API ${res.status}`);
  return (await res.json()) as SEDIAResponse;
}

/**
 * Fetch up to MAX_EU_GRANTS open/forthcoming calls from the EU Funding & Tenders Portal.
 */
export async function fetchGrantsFromEU(): Promise<GrantInput[]> {
  try {
    const out: GrantInput[] = [];
    const seen = new Set<string>();
    let page = 1;

    while (out.length < MAX_EU_GRANTS) {
      const data = await fetchSEDIAPage(page, PAGE_SIZE);
      const results = data.results ?? [];
      if (results.length === 0) break;

      for (const r of results) {
        const g = mapSEDIAResultToGrant(r);
        if (!g) continue;
        if (seen.has(g.externalId!)) continue;
        seen.add(g.externalId!);
        out.push(g);
        if (out.length >= MAX_EU_GRANTS) break;
      }

      if (results.length < PAGE_SIZE) break;
      page++;
      if (page > 10) break;
    }

    if (out.length > 0) return out;
  } catch (err) {
    console.error("[grants-eu] SEDIA API failed, no EU grants this sync:", err);
  }
  return [];
}
