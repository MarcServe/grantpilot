/**
 * Grant source registry: query due sources and run adapters.
 * Used by the grant-source-crawler Inngest job to sync from grant_sources table.
 * Throttles per domain before each source to avoid hammering portals.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import type { GrantInput } from "@/lib/grants-ingest";
import { upsertGrant } from "@/lib/grants-ingest";
import { waitForDomainThrottle } from "@/lib/throttle-per-domain";

export interface GrantSourceRow {
  id: string;
  source_name: string;
  country: string | null;
  type: string;
  endpoint: string;
  crawl_frequency: string;
  enabled: boolean;
  last_crawled_at: string | null;
  last_content_hash: string | null;
  adapter: string | null;
}

const CRAWL_INTERVAL_SQL: Record<string, string> = {
  "6h": "6 hours",
  "24h": "24 hours",
  "72h": "72 hours",
  "168h": "168 hours",
};

/**
 * Fetch grant_sources that are enabled and due for crawl (last_crawled_at + crawl_frequency <= now).
 */
export async function getDueGrantSources(): Promise<GrantSourceRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("grant_sources")
    .select("id, source_name, country, type, endpoint, crawl_frequency, enabled, last_crawled_at, last_content_hash, adapter")
    .eq("enabled", true);

  if (error) throw new Error(`grant_sources query failed: ${error.message}`);
  if (!data?.length) return [];

  const now = new Date();
  const due: GrantSourceRow[] = [];
  for (const row of data as GrantSourceRow[]) {
    const last = row.last_crawled_at ? new Date(row.last_crawled_at) : null;
    const interval = CRAWL_INTERVAL_SQL[row.crawl_frequency] ?? "24 hours";
    const nextDue = last
      ? new Date(last.getTime() + parseIntervalToMs(interval))
      : new Date(0);
    if (nextDue <= now) due.push(row);
  }
  return due;
}

function parseIntervalToMs(interval: string): number {
  const match = interval.match(/^(\d+)\s*(hour|h|min|m)s?$/i);
  if (!match) return 24 * 60 * 60 * 1000;
  const n = parseInt(match[1], 10);
  const unit = (match[2] ?? "").toLowerCase();
  if (unit.startsWith("h")) return n * 60 * 60 * 1000;
  if (unit.startsWith("m")) return n * 60 * 1000;
  return n * 60 * 60 * 1000;
}

/**
 * Run the appropriate fetcher for a source and return grants. Does not upsert; caller does that.
 */
export async function fetchGrantsForSource(source: GrantSourceRow): Promise<GrantInput[]> {
  const adapter = (source.adapter ?? source.type).toLowerCase();

  switch (adapter) {
    case "feed":
    case "json": {
      const { fetchGrantsFromFeed } = await import("@/lib/grants-ingest");
      return fetchGrantsFromFeed(source.endpoint);
    }
    case "grants-gov":
    case "grants_gov": {
      const { fetchGrantsFromGrantsGov } = await import("@/lib/grants-gov");
      return fetchGrantsFromGrantsGov(500);
    }
    case "uk": {
      const { fetchGrantsFromUK } = await import("@/lib/grants-uk");
      return fetchGrantsFromUK();
    }
    case "eu": {
      const { fetchGrantsFromEU } = await import("@/lib/grants-eu");
      return fetchGrantsFromEU();
    }
    case "au":
    case "australia": {
      const { fetchGrantsFromAU } = await import("@/lib/grants-au");
      return fetchGrantsFromAU();
    }
    case "ca":
    case "canada": {
      const { fetchGrantsFromCA } = await import("@/lib/grants-ca");
      return fetchGrantsFromCA();
    }
    case "nih":
    case "us-nih": {
      const { fetchGrantsFromNIH } = await import("@/lib/grants-us-nih");
      return fetchGrantsFromNIH();
    }
    case "rss": {
      const { fetchGrantsFromRssFeed } = await import("@/lib/grants-rss");
      return fetchGrantsFromRssFeed(source.endpoint, source.source_name);
    }
    case "crawl":
    case "foundation":
    case "newsletter": {
      const { fetchGrantsFromCrawl } = await import("@/lib/grants-crawl");
      const result = await fetchGrantsFromCrawl(source.endpoint, source.source_name, {
        lastContentHash: source.last_content_hash,
      });
      return result.grants;
    }
    default:
      throw new Error(`Unknown grant source adapter: ${adapter}`);
  }
}

/**
 * Update last_crawled_at for a source after a successful run.
 */
export async function updateLastCrawled(
  sourceId: string,
  lastContentHash?: string | null
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const payload: { last_crawled_at: string; updated_at: string; last_content_hash?: string | null } = {
    last_crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (lastContentHash !== undefined) payload.last_content_hash = lastContentHash ?? null;
  const { error } = await supabase
    .from("grant_sources")
    .update(payload)
    .eq("id", sourceId);
  if (error) throw new Error(`Failed to update last_crawled_at: ${error.message}`);
}

/**
 * Run one source: fetch grants, upsert each, then update last_crawled_at.
 * Throttles per domain before fetching. For crawl/foundation/newsletter, uses change detection (last_content_hash).
 */
export async function runSourceAndUpsert(source: GrantSourceRow): Promise<{
  synced: number;
  created: number;
  updated: number;
}> {
  await waitForDomainThrottle(source.endpoint);

  const adapter = (source.adapter ?? source.type).toLowerCase();
  const isCrawlType = ["crawl", "foundation", "newsletter"].includes(adapter);

  let grants: GrantInput[];
  let contentHash: string | null = null;

  if (isCrawlType) {
    const { fetchGrantsFromCrawl } = await import("@/lib/grants-crawl");
    const result = await fetchGrantsFromCrawl(source.endpoint, source.source_name, {
      skipClassifier: false,
      lastContentHash: source.last_content_hash,
    });
    grants = result.grants;
    contentHash = result.contentHash;
  } else {
    grants = await fetchGrantsForSource(source);
  }

  let created = 0;
  let updated = 0;
  for (const g of grants) {
    try {
      const { created: c } = await upsertGrant(g);
      if (c) created++;
      else updated++;
    } catch (e) {
      console.warn(`[grant-sources] Skip grant from ${source.source_name}:`, e);
    }
  }
  await updateLastCrawled(source.id, contentHash ?? undefined);
  return { synced: grants.length, created, updated };
}
