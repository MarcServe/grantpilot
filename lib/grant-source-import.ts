import { createHash } from "crypto";
import { z } from "zod";
import { DEFAULT_UK_EU_GLOBAL_GRANT_SOURCE_SEEDS } from "@/lib/default-grant-source-seeds";
import { grantSourceEndpointKey, normaliseGrantSourceEndpoint } from "@/lib/grant-source-endpoint";
import { getSupabaseAdmin } from "@/lib/supabase";

const sourceTypes = ["rss", "government_portal", "foundation", "newsletter"] as const;
const crawlFrequencies = ["6h", "24h", "72h", "168h"] as const;

const sourceSchema = z.object({
  sourceName: z.string().trim().min(2).max(160),
  endpoint: z.string().trim().min(4).max(2000),
  country: z.string().trim().max(60).optional().nullable(),
  type: z.enum(sourceTypes).default("government_portal"),
  crawlFrequency: z.enum(crawlFrequencies).default("24h"),
  enabled: z.boolean().default(true),
  manualReview: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
  metadata: z.custom<Record<string, unknown> | null | undefined>(
    (value) => value == null || (typeof value === "object" && !Array.isArray(value))
  ).optional().nullable(),
});

type SourceInput = z.infer<typeof sourceSchema>;
type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export type GrantSourceImportResultRow = {
  sourceName: string;
  endpoint: string;
  status: "added" | "duplicate" | "rejected" | "manual_review";
  reason?: string;
  id?: string;
};

export type GrantSourceImportResult = {
  ok: true;
  requested: number;
  added: number;
  duplicates: number;
  rejected: number;
  manualReview: number;
  defaultSeeded: boolean;
  results: GrantSourceImportResultRow[];
};

export class GrantSourceImportError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function defaultAdapter(type: SourceInput["type"]): "rss" | "crawl" {
  return type === "rss" ? "rss" : "crawl";
}

function sourceIdForEndpoint(endpoint: string): string {
  const hash = createHash("sha256").update(grantSourceEndpointKey(endpoint)).digest("hex").slice(0, 20);
  return `auto-${hash}`;
}

function isMissingSourceMetadataColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    message.includes("metadata") ||
    message.includes("notes")
  );
}

async function insertGrantSourceRows(
  supabase: SupabaseAdmin,
  inserts: Record<string, unknown>[]
): Promise<void> {
  if (inserts.length === 0) return;

  let insertResult = await supabase.from("grant_sources").insert(inserts);
  if (insertResult.error && isMissingSourceMetadataColumn(insertResult.error)) {
    const fallbackInserts = inserts.map(({ notes: _notes, metadata: _metadata, ...row }) => row);
    insertResult = await supabase.from("grant_sources").insert(fallbackInserts);
  }
  if (insertResult.error) {
    throw new GrantSourceImportError(500, insertResult.error.message);
  }
}

function readString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readType(row: Record<string, unknown>): SourceInput["type"] {
  const raw = String(row.type ?? row.sourceType ?? row.source_type ?? "").toLowerCase();
  if (raw.includes("rss") || raw.includes("atom")) return "rss";
  if (raw.includes("foundation")) return "foundation";
  if (raw.includes("newsletter") || raw.includes("archive")) return "newsletter";
  return "government_portal";
}

function readFrequency(row: Record<string, unknown>): SourceInput["crawlFrequency"] {
  const raw = String(row.crawlFrequency ?? row.crawl_frequency ?? row.update_cadence_if_known ?? "").toLowerCase();
  if (raw.includes("6h") || raw.includes("6 hour")) return "6h";
  if (raw.includes("72h") || raw.includes("3 day") || raw.includes("3-day")) return "72h";
  if (raw.includes("week")) return "168h";
  if (raw.includes("hour") || raw.includes("daily") || raw.includes("day")) return "24h";
  return "24h";
}

function normaliseSource(row: unknown): { source?: SourceInput; result?: GrantSourceImportResultRow } {
  if (!row || typeof row !== "object") {
    return {
      result: {
        sourceName: "Unknown source",
        endpoint: "",
        status: "rejected",
        reason: "Source must be an object.",
      },
    };
  }

  const sourceRow = row as Record<string, unknown>;
  const endpointRaw = readString(sourceRow, ["endpoint", "sourceUrl", "source_url", "url"]);
  const sourceName =
    readString(sourceRow, ["sourceName", "source_name", "source_title", "funder_or_portal_name", "name"]) ??
    endpointRaw ??
    "Untitled source";

  if (!endpointRaw) {
    return {
      result: {
        sourceName,
        endpoint: "",
        status: "rejected",
        reason: "Missing source URL.",
      },
    };
  }

  let endpoint: string;
  try {
    endpoint = normaliseGrantSourceEndpoint(endpointRaw);
  } catch (error) {
    return {
      result: {
        sourceName,
        endpoint: endpointRaw,
        status: "rejected",
        reason: error instanceof Error ? error.message : "Invalid source URL.",
      },
    };
  }

  const source = {
    sourceName,
    endpoint,
    country:
      readString(sourceRow, ["country", "country_or_region", "geography_bucket", "region"]) ??
      null,
    type: readType(sourceRow),
    crawlFrequency: readFrequency(sourceRow),
    enabled: sourceRow.enabled !== false,
    manualReview: sourceRow.manualReview === true || sourceRow.manual_review === true,
    notes:
      readString(sourceRow, ["notes", "access_notes", "why_it_matters", "robots_notes"]) ??
      null,
    metadata:
      sourceRow.metadata && typeof sourceRow.metadata === "object" && !Array.isArray(sourceRow.metadata)
        ? sourceRow.metadata as Record<string, unknown>
        : null,
  };

  const parsed = sourceSchema.safeParse(source);
  if (!parsed.success) {
    return {
      result: {
        sourceName,
        endpoint,
        status: "rejected",
        reason: parsed.error.issues[0]?.message ?? "Invalid source.",
      },
    };
  }

  return { source: parsed.data };
}

function payloadObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

export async function importGrantSourcesFromPayload(
  payload: unknown,
  options?: { supabase?: SupabaseAdmin }
): Promise<GrantSourceImportResult> {
  const body = payloadObject(payload);
  const explicitRows = Array.isArray(payload) ? payload : body.sources;
  if (explicitRows != null && !Array.isArray(explicitRows)) {
    throw new GrantSourceImportError(400, "Body must be a JSON array or { sources: [...] }.");
  }

  const shouldSeedDefaults =
    body.seedDefaultSources === true ||
    body.autoSeedDefaultSources === true ||
    (Array.isArray(explicitRows) && explicitRows.length === 0);
  const sourceRows = Array.isArray(explicitRows) && explicitRows.length > 0
    ? explicitRows
    : shouldSeedDefaults
      ? DEFAULT_UK_EU_GLOBAL_GRANT_SOURCE_SEEDS
      : [];

  const supabase = options?.supabase ?? getSupabaseAdmin();
  const existingResult = await supabase.from("grant_sources").select("id, endpoint");
  if (existingResult.error) {
    throw new GrantSourceImportError(500, existingResult.error.message);
  }

  const existingByEndpoint = new Map<string, string>();
  for (const row of (existingResult.data ?? []) as { id: string; endpoint: string | null }[]) {
    if (row.endpoint) existingByEndpoint.set(grantSourceEndpointKey(row.endpoint), row.id);
  }

  const seenInRequest = new Set<string>();
  const results: GrantSourceImportResultRow[] = [];
  const inserts: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const row of sourceRows) {
    const { source, result } = normaliseSource(row);
    if (!source) {
      if (result) results.push(result);
      continue;
    }

    const key = grantSourceEndpointKey(source.endpoint);
    if (source.manualReview) {
      results.push({
        sourceName: source.sourceName,
        endpoint: source.endpoint,
        status: "manual_review",
        reason: source.notes ?? "Marked for manual review by discovery automation.",
      });
      continue;
    }

    const duplicateId = existingByEndpoint.get(key);
    if (duplicateId || seenInRequest.has(key)) {
      results.push({
        sourceName: source.sourceName,
        endpoint: source.endpoint,
        status: "duplicate",
        reason: duplicateId ? `Already exists as ${duplicateId}.` : "Duplicate within this import payload.",
        id: duplicateId,
      });
      continue;
    }

    const id = sourceIdForEndpoint(source.endpoint);
    seenInRequest.add(key);
    existingByEndpoint.set(key, id);
    inserts.push({
      id,
      source_name: source.sourceName,
      country: source.country,
      type: source.type,
      endpoint: source.endpoint,
      crawl_frequency: source.crawlFrequency,
      enabled: source.enabled,
      adapter: defaultAdapter(source.type),
      notes: source.notes,
      metadata: source.metadata ?? null,
      last_crawled_at: null,
      last_content_hash: null,
      updated_at: now,
    });
    results.push({
      sourceName: source.sourceName,
      endpoint: source.endpoint,
      status: "added",
      id,
    });
  }

  await insertGrantSourceRows(supabase, inserts);

  const added = results.filter((row) => row.status === "added").length;
  const duplicates = results.filter((row) => row.status === "duplicate").length;
  const rejected = results.filter((row) => row.status === "rejected").length;
  const manualReview = results.filter((row) => row.status === "manual_review").length;

  const logResult = await supabase.from("grant_source_import_runs").insert({
    run_source: typeof body.runSource === "string" ? body.runSource : "automation",
    created_by: typeof body.createdBy === "string" ? body.createdBy : null,
    requested_count: sourceRows.length,
    added_count: added,
    skipped_duplicate_count: duplicates,
    rejected_count: rejected,
    manual_review_count: manualReview,
    results,
  });
  if (logResult.error) {
    console.warn("[grant-sources/import] failed to write import log:", logResult.error.message);
  }

  return {
    ok: true,
    requested: sourceRows.length,
    added,
    duplicates,
    rejected,
    manualReview,
    defaultSeeded: sourceRows === DEFAULT_UK_EU_GLOBAL_GRANT_SOURCE_SEEDS,
    results,
  };
}
