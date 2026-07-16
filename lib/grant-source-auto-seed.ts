import { createHash } from "crypto";
import { DEFAULT_UK_EU_GLOBAL_GRANT_SOURCE_SEEDS } from "@/lib/default-grant-source-seeds";
import { grantSourceEndpointKey, normaliseGrantSourceEndpoint } from "@/lib/grant-source-endpoint";
import { getSupabaseAdmin } from "@/lib/supabase";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type AutoSeedResultRow = {
  sourceName: string;
  endpoint: string;
  status: "added" | "duplicate" | "rejected";
  reason?: string;
  id?: string;
};

export type AutoSeedGrantSourcesResult = {
  requested: number;
  added: number;
  duplicates: number;
  rejected: number;
  results: AutoSeedResultRow[];
};

function sourceIdForEndpoint(endpoint: string): string {
  const hash = createHash("sha256").update(grantSourceEndpointKey(endpoint)).digest("hex").slice(0, 20);
  return `auto-${hash}`;
}

async function shouldWriteImportLog(supabase: SupabaseAdmin, values: {
  runSource: string;
  added: number;
  duplicates: number;
  rejected: number;
}): Promise<boolean> {
  if (values.added > 0 || values.rejected > 0 || values.duplicates === 0) return true;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("grant_source_import_runs")
    .select("id")
    .eq("run_source", values.runSource)
    .eq("added_count", 0)
    .eq("rejected_count", 0)
    .gte("created_at", cutoff)
    .limit(1);
  if (error) {
    console.warn("[grant-sources/auto-seed] duplicate log throttle lookup failed:", error.message);
    return true;
  }
  return (data ?? []).length === 0;
}

export async function autoSeedDefaultGrantSources(options?: {
  supabase?: SupabaseAdmin;
  runSource?: string;
  createdBy?: string;
  limit?: number;
}): Promise<AutoSeedGrantSourcesResult> {
  const supabase = options?.supabase ?? getSupabaseAdmin();
  const seeds = typeof options?.limit === "number" && options.limit > 0
    ? DEFAULT_UK_EU_GLOBAL_GRANT_SOURCE_SEEDS.slice(0, Math.floor(options.limit))
    : DEFAULT_UK_EU_GLOBAL_GRANT_SOURCE_SEEDS;

  const existingResult = await supabase.from("grant_sources").select("id, endpoint");
  if (existingResult.error) {
    throw new Error(`grant_sources seed lookup failed: ${existingResult.error.message}`);
  }

  const existingByEndpoint = new Map<string, string>();
  for (const row of (existingResult.data ?? []) as { id: string; endpoint: string | null }[]) {
    if (row.endpoint) existingByEndpoint.set(grantSourceEndpointKey(row.endpoint), row.id);
  }

  const results: AutoSeedResultRow[] = [];
  const inserts: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const seed of seeds) {
    let endpoint: string;
    try {
      endpoint = normaliseGrantSourceEndpoint(seed.endpoint);
    } catch (error) {
      results.push({
        sourceName: seed.sourceName,
        endpoint: seed.endpoint,
        status: "rejected",
        reason: error instanceof Error ? error.message : "Invalid source URL.",
      });
      continue;
    }

    const endpointKey = grantSourceEndpointKey(endpoint);
    const duplicateId = existingByEndpoint.get(endpointKey);
    if (duplicateId) {
      results.push({
        sourceName: seed.sourceName,
        endpoint,
        status: "duplicate",
        reason: `Already exists as ${duplicateId}.`,
        id: duplicateId,
      });
      continue;
    }

    const id = sourceIdForEndpoint(endpoint);
    existingByEndpoint.set(endpointKey, id);
    inserts.push({
      id,
      source_name: seed.sourceName,
      country: seed.country,
      type: seed.type,
      endpoint,
      crawl_frequency: seed.crawlFrequency,
      enabled: true,
      adapter: seed.type === "rss" ? "rss" : "crawl",
      last_crawled_at: null,
      last_content_hash: null,
      updated_at: now,
    });
    results.push({
      sourceName: seed.sourceName,
      endpoint,
      status: "added",
      id,
    });
  }

  if (inserts.length > 0) {
    const insertResult = await supabase.from("grant_sources").insert(inserts);
    if (insertResult.error) {
      throw new Error(`grant_sources default seed insert failed: ${insertResult.error.message}`);
    }
  }

  const added = results.filter((row) => row.status === "added").length;
  const duplicates = results.filter((row) => row.status === "duplicate").length;
  const rejected = results.filter((row) => row.status === "rejected").length;

  const runSource = options?.runSource ?? "app_default_seed";
  const writeImportLog = await shouldWriteImportLog(supabase, { runSource, added, duplicates, rejected });
  if (writeImportLog) {
    const logResult = await supabase.from("grant_source_import_runs").insert({
      run_source: runSource,
      created_by: options?.createdBy ?? "grant-source-crawler",
      requested_count: seeds.length,
      added_count: added,
      skipped_duplicate_count: duplicates,
      rejected_count: rejected,
      manual_review_count: 0,
      results,
    });
    if (logResult.error) {
      console.warn("[grant-sources/auto-seed] failed to write import log:", logResult.error.message);
    }
  }

  return {
    requested: seeds.length,
    added,
    duplicates,
    rejected,
    results,
  };
}
