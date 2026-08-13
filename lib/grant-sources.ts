/**
 * Grant source registry: query due sources and run adapters.
 * Used by the grant-source-crawler Inngest job to sync from grant_sources table.
 * Throttles per domain before each source to avoid hammering portals.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { inngest } from "@/inngest/client";
import type { GrantInput } from "@/lib/grants-ingest";
import { upsertGrant } from "@/lib/grants-ingest";
import { waitForDomainThrottle } from "@/lib/throttle-per-domain";
import { autoSeedDefaultGrantSources, type AutoSeedGrantSourcesResult } from "@/lib/grant-source-auto-seed";

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
  claim_token?: string | null;
  claimed_at?: string | null;
  last_crawl_status?: string | null;
  last_crawl_error?: string | null;
  last_crawl_result?: Record<string, unknown> | null;
}

export interface GrantSourceRunResult {
  sourceId: string;
  sourceName: string;
  synced: number;
  created: number;
  updated: number;
  error?: string;
}

export type GrantSourceFailureKind = "blocked" | "missing" | "timeout" | "internal";

export interface GrantSourceFailureClassification {
  kind: GrantSourceFailureKind;
  external: boolean;
  message: string;
}

export interface GrantSourceEnqueueResult {
  ok: true;
  claimed: number;
  enqueued: number;
  processed: number;
  failedExternal: number;
  failedInternal: number;
  durationMs: number;
  sourceSeed?: AutoSeedGrantSourcesResult;
  sources: Array<{ sourceId: string; sourceName: string }>;
}

export interface ClaimDueGrantSourcesOptions {
  limit?: number;
  claimTtlMinutes?: number;
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
    .eq("enabled", true)
    .order("last_crawled_at", { ascending: true, nullsFirst: true })
    .order("source_name", { ascending: true });

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

function safeLimit(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function isMissingClaimSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST202" ||
    error?.code === "PGRST204" ||
    message.includes("claim_due_grant_sources") ||
    message.includes("claim_token") ||
    message.includes("last_crawl_status")
  );
}

function sourceSelectWithClaimColumns(): string {
  return [
    "id",
    "source_name",
    "country",
    "type",
    "endpoint",
    "crawl_frequency",
    "enabled",
    "last_crawled_at",
    "last_content_hash",
    "adapter",
    "claim_token",
    "claimed_at",
    "last_crawl_status",
    "last_crawl_error",
    "last_crawl_result",
  ].join(", ");
}

export function classifyGrantSourceFailure(error: unknown): GrantSourceFailureClassification {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("robots") || lower.includes("403") || lower.includes("forbidden")) {
    return { kind: "blocked", external: true, message };
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return { kind: "missing", external: true, message };
  }
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborterror") ||
    lower.includes("etimedout") ||
    lower.includes("und_err_connect_timeout")
  ) {
    return { kind: "timeout", external: true, message };
  }
  return { kind: "internal", external: false, message };
}

export function sourceClaimMatches(source: Pick<GrantSourceRow, "claim_token">, expectedClaimToken?: string | null): boolean {
  return !expectedClaimToken || source.claim_token === expectedClaimToken;
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

function sourceRunPriority(source: GrantSourceRow): number {
  const adapter = (source.adapter ?? source.type).toLowerCase();
  const sourceText = `${source.source_name} ${source.country ?? ""} ${source.type} ${source.endpoint}`.toLowerCase();
  const neverCrawled = !source.last_crawled_at;
  const localOrRegionalSource =
    sourceText.includes("council") ||
    sourceText.includes("local authority") ||
    sourceText.includes("growth hub") ||
    sourceText.includes("combined authority") ||
    sourceText.includes("business support") ||
    sourceText.includes("business growth") ||
    sourceText.includes("enterprise") ||
    sourceText.includes("freeport") ||
    sourceText.includes("investment zone");

  if (neverCrawled && localOrRegionalSource) return 0;
  if (neverCrawled) return 1;
  if (adapter === "rss" || adapter === "feed" || adapter === "json") return 2;
  if (["grants-gov", "grants_gov", "uk", "eu", "au", "australia", "ca", "canada", "nih", "us-nih"].includes(adapter)) {
    return 3;
  }
  if (localOrRegionalSource) return 4;
  return 5;
}

function sourceLastCrawledTime(source: GrantSourceRow): number {
  if (!source.last_crawled_at) return 0;
  const time = new Date(source.last_crawled_at).getTime();
  return Number.isFinite(time) ? time : 0;
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
  lastContentHash?: string | null,
  result?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    last_crawled_at: now,
    updated_at: now,
    claim_token: null,
    claimed_at: null,
    last_crawl_status: "success",
    last_crawl_error: null,
    last_crawl_result: result ?? {},
  };
  if (lastContentHash !== undefined) payload.last_content_hash = lastContentHash ?? null;
  const { error } = await supabase
    .from("grant_sources")
    .update(payload)
    .eq("id", sourceId);
  if (error && isMissingClaimSchemaError(error)) {
    const fallbackPayload: { last_crawled_at: string; updated_at: string; last_content_hash?: string | null } = {
      last_crawled_at: now,
      updated_at: now,
    };
    if (lastContentHash !== undefined) fallbackPayload.last_content_hash = lastContentHash ?? null;
    const fallback = await supabase
      .from("grant_sources")
      .update(fallbackPayload)
      .eq("id", sourceId);
    if (fallback.error) throw new Error(`Failed to update last_crawled_at: ${fallback.error.message}`);
    return;
  }
  if (error) throw new Error(`Failed to update last_crawled_at: ${error.message}`);
}

export async function markSourceRunOutcome(
  sourceId: string,
  status: string,
  details?: {
    error?: string | null;
    lastContentHash?: string | null;
    result?: Record<string, unknown>;
  }
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    last_crawled_at: now,
    updated_at: now,
    claim_token: null,
    claimed_at: null,
    last_crawl_status: status,
    last_crawl_error: details?.error ? details.error.slice(0, 2000) : null,
    last_crawl_result: details?.result ?? {},
  };
  if (details?.lastContentHash !== undefined) payload.last_content_hash = details.lastContentHash ?? null;
  const { error } = await supabase
    .from("grant_sources")
    .update(payload)
    .eq("id", sourceId);
  if (error && isMissingClaimSchemaError(error)) {
    await updateLastCrawled(sourceId, details?.lastContentHash);
    return;
  }
  if (error) throw new Error(`Failed to mark source run outcome: ${error.message}`);
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
  await updateLastCrawled(source.id, contentHash ?? undefined, {
    synced: grants.length,
    created,
    updated,
  });
  return { synced: grants.length, created, updated };
}

export async function claimDueGrantSources(options?: ClaimDueGrantSourcesOptions): Promise<GrantSourceRow[]> {
  const limit = safeLimit(options?.limit, 20, 1, 100);
  const claimTtlMinutes = safeLimit(options?.claimTtlMinutes, 30, 1, 180);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("claim_due_grant_sources", {
    p_limit: limit,
    p_claim_ttl_minutes: claimTtlMinutes,
  });

  if (!error) return (data ?? []) as GrantSourceRow[];
  if (!isMissingClaimSchemaError(error)) throw new Error(`claim_due_grant_sources failed: ${error.message}`);

  const due = await getDueGrantSources();
  return [...due]
    .sort((a, b) =>
      sourceRunPriority(a) - sourceRunPriority(b) ||
      sourceLastCrawledTime(a) - sourceLastCrawledTime(b) ||
      a.source_name.localeCompare(b.source_name)
    )
    .slice(0, limit);
}

export async function enqueueDueGrantSourceRuns(options?: {
  limit?: number;
  claimTtlMinutes?: number;
  source?: string;
}): Promise<GrantSourceEnqueueResult> {
  const startedAt = Date.now();
  const sourceSeed = await autoSeedDefaultGrantSources({
    runSource: "app_default_seed",
    createdBy: "grant-source-crawler",
  });
  const claimed = await claimDueGrantSources({
    limit: options?.limit,
    claimTtlMinutes: options?.claimTtlMinutes,
  });

  const events = claimed.map((source) => ({
    id: `grant-source:${source.id}:${source.claim_token ?? new Date().toISOString()}`,
    name: "grant-source/run.requested",
    data: {
      sourceId: source.id,
      claimToken: source.claim_token ?? null,
      sourceName: source.source_name,
      requestedBy: options?.source ?? "unknown",
    },
  }));

  if (events.length > 0) await inngest.send(events);

  return {
    ok: true,
    claimed: claimed.length,
    enqueued: events.length,
    processed: 0,
    failedExternal: 0,
    failedInternal: 0,
    durationMs: Date.now() - startedAt,
    sourceSeed,
    sources: claimed.map((source) => ({ sourceId: source.id, sourceName: source.source_name })),
  };
}

export async function getGrantSourceById(sourceId: string): Promise<GrantSourceRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("grant_sources")
    .select(sourceSelectWithClaimColumns())
    .eq("id", sourceId)
    .maybeSingle();

  if (!error) return data as GrantSourceRow | null;
  if (!isMissingClaimSchemaError(error)) throw new Error(`grant_sources lookup failed: ${error.message}`);

  const fallback = await supabase
    .from("grant_sources")
    .select("id, source_name, country, type, endpoint, crawl_frequency, enabled, last_crawled_at, last_content_hash, adapter")
    .eq("id", sourceId)
    .maybeSingle();
  if (fallback.error) throw new Error(`grant_sources lookup failed: ${fallback.error.message}`);
  return fallback.data as GrantSourceRow | null;
}

export async function runClaimedGrantSource(input: {
  sourceId: string;
  claimToken?: string | null;
}): Promise<{
  sourceId: string;
  sourceName?: string;
  processed: number;
  synced: number;
  created: number;
  updated: number;
  failedExternal: number;
  failedInternal: number;
  skipped?: boolean;
  status: string;
  durationMs: number;
}> {
  const startedAt = Date.now();
  const source = await getGrantSourceById(input.sourceId);
  if (!source) {
    return {
      sourceId: input.sourceId,
      processed: 0,
      synced: 0,
      created: 0,
      updated: 0,
      failedExternal: 0,
      failedInternal: 0,
      skipped: true,
      status: "missing_source",
      durationMs: Date.now() - startedAt,
    };
  }

  if (!sourceClaimMatches(source, input.claimToken)) {
    return {
      sourceId: source.id,
      sourceName: source.source_name,
      processed: 0,
      synced: 0,
      created: 0,
      updated: 0,
      failedExternal: 0,
      failedInternal: 0,
      skipped: true,
      status: "stale_claim",
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    const result = await runSourceAndUpsert(source);
    return {
      sourceId: source.id,
      sourceName: source.source_name,
      processed: 1,
      synced: result.synced,
      created: result.created,
      updated: result.updated,
      failedExternal: 0,
      failedInternal: 0,
      status: "success",
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const classification = classifyGrantSourceFailure(error);
    await markSourceRunOutcome(source.id, classification.kind, {
      error: classification.message,
      result: {
        failedExternal: classification.external ? 1 : 0,
        failedInternal: classification.external ? 0 : 1,
      },
    }).catch((updateError) => {
      console.warn(`[grant-source-crawler] failed to mark source outcome ${source.id}:`, updateError);
    });

    if (classification.external) {
      return {
        sourceId: source.id,
        sourceName: source.source_name,
        processed: 1,
        synced: 0,
        created: 0,
        updated: 0,
        failedExternal: 1,
        failedInternal: 0,
        status: classification.kind,
        durationMs: Date.now() - startedAt,
      };
    }

    console.error(`[grant-source-crawler] ${source.source_name} (${source.id}):`, error);
    throw error;
  }
}

/**
 * Run due registry sources with per-source isolation. Failed sources are marked
 * attempted so one bad portal/feed cannot starve the rest of the registry.
 */
export async function runDueGrantSources(options?: { limit?: number; skipAutoSeed?: boolean }): Promise<{
  dueCount: number;
  attempted: number;
  synced: number;
  created: number;
  updated: number;
  failed: number;
  sourceSeed?: AutoSeedGrantSourcesResult;
  results: GrantSourceRunResult[];
}> {
  const sourceSeed = options?.skipAutoSeed
    ? undefined
    : await autoSeedDefaultGrantSources({
        runSource: "app_default_seed",
        createdBy: "grant-source-crawler",
      });
  const selectedLimit = safeLimit(options?.limit, 20, 1, 100);
  const selected = await claimDueGrantSources({ limit: selectedLimit });
  const results: GrantSourceRunResult[] = [];

  let synced = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const source of selected) {
    try {
      const result = await runSourceAndUpsert(source);
      synced += result.synced;
      created += result.created;
      updated += result.updated;
      results.push({
        sourceId: source.id,
        sourceName: source.source_name,
        synced: result.synced,
        created: result.created,
        updated: result.updated,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const classification = classifyGrantSourceFailure(err);
      failed++;
      if (classification.external) {
        console.warn(`[grant-source-crawler] external ${classification.kind} for ${source.source_name} (${source.id}): ${message}`);
      } else {
        console.error(`[grant-source-crawler] ${source.source_name} (${source.id}):`, err);
      }
      await markSourceRunOutcome(source.id, classification.kind, {
        error: message,
        result: {
          failedExternal: classification.external ? 1 : 0,
          failedInternal: classification.external ? 0 : 1,
        },
      }).catch((updateErr) => {
        console.error(`[grant-source-crawler] failed to mark attempted ${source.id}:`, updateErr);
      });
      results.push({
        sourceId: source.id,
        sourceName: source.source_name,
        synced: 0,
        created: 0,
        updated: 0,
        error: message,
      });
    }
  }

  return {
    dueCount: selected.length,
    attempted: selected.length,
    synced,
    created,
    updated,
    failed,
    sourceSeed,
    results,
  };
}
