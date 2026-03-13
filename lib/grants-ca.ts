/**
 * Canada grants: proactive disclosure dataset (awards/agreements).
 * Fetches from Open Canada CSV and maps to GrantInput for discovery.
 * Not "open for application" listings — use for program/funder visibility.
 */

import type { GrantInput } from "@/lib/grants-ingest";
import { looksLikeGenericOrListUrl } from "@/lib/grant-url-validation";

const CANADA_GRANTS_CSV =
  "https://open.canada.ca/data/dataset/432527ab-7aac-45b5-81d6-7597107a7013/resource/1d15a62f-5656-49ad-8c88-f40ce689d831/download/grants.csv";
const SEARCH_BASE = "https://search.open.canada.ca/grants";
const MAX_RECORDS = 400;

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      cur += c;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseDate(s: string | undefined): string | null {
  if (!s?.trim()) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Fetch Canada grants from Open Canada proactive disclosure CSV; map to GrantInput.
 */
export async function fetchGrantsFromCA(): Promise<GrantInput[]> {
  try {
    const res = await fetch(CANADA_GRANTS_CSV, {
      headers: { Accept: "text/csv" },
      signal: AbortSignal.timeout(30_000),
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`Canada grants CSV ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const header = parseCSVLine(lines[0]).map((h) => h.replace(/^\s*"/, "").replace(/"\s*$/, ""));
    const nameIdx = header.findIndex((h) => /agreement|title|name|program/i.test(h));
    const orgIdx = header.findIndex((h) => /organization|department|funder|recipient/i.test(h));
    const valueIdx = header.findIndex((h) => /value|amount|contribution/i.test(h));
    const refIdx = header.findIndex((h) => /reference|number|id/i.test(h));
    const startIdx = header.findIndex((h) => /start|date|effective/i.test(h));

    const nameCol = nameIdx >= 0 ? nameIdx : 0;
    const orgCol = orgIdx >= 0 ? orgIdx : 1;
    const valueCol = valueIdx >= 0 ? valueIdx : 2;
    const refCol = refIdx >= 0 ? refIdx : 0;
    const startCol = startIdx >= 0 ? startIdx : -1;

    const out: GrantInput[] = [];
    const seen = new Set<string>();

    for (let i = 1; i < lines.length && out.length < MAX_RECORDS; i++) {
      const row = parseCSVLine(lines[i]);
      const name = (row[nameCol] ?? row[0] ?? "").replace(/^"|"$/g, "").trim();
      const org = (row[orgCol] ?? row[1] ?? "Government of Canada").replace(/^"|"$/g, "").trim();
      if (!name || !org) continue;

      const ref = refCol >= 0 ? (row[refCol] ?? "").trim() : "";
      const externalId = ref ? `ca-${ref}` : undefined;
      const valueStr = valueCol >= 0 ? (row[valueCol] ?? "").replace(/[$,]/g, "").trim() : "";
      const amount = valueStr ? parseFloat(valueStr) : null;
      const appUrl = `${SEARCH_BASE}/?q=${encodeURIComponent(name.slice(0, 80))}`;
      if (looksLikeGenericOrListUrl(appUrl)) continue;

      const key = externalId ?? `${name}|${org}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const startDate = startCol >= 0 ? row[startCol] : null;
      out.push({
        externalId,
        name: name.slice(0, 500),
        funder: org.slice(0, 300),
        amount: amount != null && !Number.isNaN(amount) ? amount : null,
        deadline: parseDate(startDate ?? undefined),
        applicationUrl: appUrl,
        eligibility: "See Government of Canada grants search for details.",
        sectors: [],
        regions: ["Canada"],
        funderLocations: ["CA"],
        source: "default",
      });
    }
    return out;
  } catch (err) {
    console.error("[grants-ca] Canada grants fetch failed:", err);
    return [];
  }
}
