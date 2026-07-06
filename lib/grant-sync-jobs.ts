import { inngest } from "@/inngest/client";
import {
  syncGrantsFromEU,
  syncGrantsFromFeed,
  syncGrantsFromUK,
  upsertGrant,
} from "@/lib/grants-ingest";
import { fetchGrantsGovPage } from "@/lib/grants-gov";

export type GrantSyncSource = "feed" | "uk" | "eu";

export type GrantSyncEnqueueResult = {
  ok: true;
  enqueued: number;
  claimed: number;
  processed: number;
  failedExternal: number;
  failedInternal: number;
  durationMs: number;
  sources: GrantSyncSource[];
  grantsGov: {
    startRecord: number;
    rows: number;
    maxTotal: number;
  };
};

export type GrantSyncWorkerResult = {
  source: GrantSyncSource | "grants-gov";
  synced: number;
  created: number;
  updated: number;
  failedExternal: number;
  failedInternal: number;
  enqueued: number;
  durationMs: number;
};

const GRANTS_GOV_ROWS_PER_PAGE = 100;
const DEFAULT_GRANTS_GOV_MAX_TOTAL = 500;

function dateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function boundedPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function shouldEnqueueNextGrantsGovPage(input: {
  startRecord: number;
  rows: number;
  rawHits: number;
  hitCount: number;
  maxTotal: number;
}): { enqueue: boolean; nextStartRecord: number } {
  const nextStartRecord = input.startRecord + input.rows;
  return {
    enqueue: input.rawHits > 0 && nextStartRecord < input.hitCount && nextStartRecord < input.maxTotal,
    nextStartRecord,
  };
}

export async function enqueueGrantSync(options?: {
  source?: string;
  maxGrantsGovTotal?: number;
  now?: Date;
}): Promise<GrantSyncEnqueueResult> {
  const startedAt = Date.now();
  const maxTotal = boundedPositiveInt(
    options?.maxGrantsGovTotal ?? process.env.GRANTS_GOV_SYNC_MAX_TOTAL,
    DEFAULT_GRANTS_GOV_MAX_TOTAL,
    1,
    1000
  );
  const day = dateKey(options?.now);
  const sources: GrantSyncSource[] = ["feed", "uk", "eu"];
  const events = [
    ...sources.map((source) => ({
      id: `grant-sync:${day}:${source}`,
      name: "grant-sync/source.requested",
      data: { source, requestedBy: options?.source ?? "unknown" },
    })),
    {
      id: `grant-sync:${day}:grants-gov:0`,
      name: "grant-sync/grants-gov-page.requested",
      data: {
        startRecord: 0,
        rows: GRANTS_GOV_ROWS_PER_PAGE,
        maxTotal,
        requestedBy: options?.source ?? "unknown",
        batchKey: day,
      },
    },
  ];

  await inngest.send(events);

  return {
    ok: true,
    enqueued: events.length,
    claimed: 0,
    processed: 0,
    failedExternal: 0,
    failedInternal: 0,
    durationMs: Date.now() - startedAt,
    sources,
    grantsGov: {
      startRecord: 0,
      rows: GRANTS_GOV_ROWS_PER_PAGE,
      maxTotal,
    },
  };
}

export async function processGrantSyncSource(source: GrantSyncSource): Promise<GrantSyncWorkerResult> {
  const startedAt = Date.now();
  const result =
    source === "feed"
      ? await syncGrantsFromFeed()
      : source === "uk"
        ? await syncGrantsFromUK()
        : await syncGrantsFromEU();

  return {
    source,
    synced: result.synced,
    created: result.created,
    updated: result.updated,
    failedExternal: 0,
    failedInternal: 0,
    enqueued: 0,
    durationMs: Date.now() - startedAt,
  };
}

export async function processGrantsGovPage(options: {
  startRecord?: number;
  rows?: number;
  maxTotal?: number;
  batchKey?: string;
}): Promise<GrantSyncWorkerResult & { rawHits: number; hitCount: number; nextStartRecord: number | null }> {
  const startedAt = Date.now();
  const startRecord = boundedPositiveInt(options.startRecord, 0, 0, 1000);
  const rows = boundedPositiveInt(options.rows, GRANTS_GOV_ROWS_PER_PAGE, 1, GRANTS_GOV_ROWS_PER_PAGE);
  const maxTotal = boundedPositiveInt(options.maxTotal, DEFAULT_GRANTS_GOV_MAX_TOTAL, 1, 1000);
  const { grants, hitCount, rawHits } = await fetchGrantsGovPage(startRecord, rows);

  let created = 0;
  let updated = 0;
  let failedExternal = 0;
  const failedInternal = 0;

  for (const grant of grants) {
    try {
      const result = await upsertGrant(grant);
      if (result.created) created++;
      else updated++;
    } catch (error) {
      failedExternal++;
      console.warn("[grant-sync] Skip Grants.gov grant", grant.externalId, error);
    }
  }

  const next = shouldEnqueueNextGrantsGovPage({ startRecord, rows, rawHits, hitCount, maxTotal });
  let enqueued = 0;
  if (next.enqueue) {
    await inngest.send({
      id: `grant-sync:${options.batchKey ?? dateKey()}:grants-gov:${next.nextStartRecord}`,
      name: "grant-sync/grants-gov-page.requested",
      data: {
        startRecord: next.nextStartRecord,
        rows,
        maxTotal,
        batchKey: options.batchKey ?? dateKey(),
      },
    });
    enqueued = 1;
  }

  return {
    source: "grants-gov",
    synced: grants.length,
    created,
    updated,
    failedExternal,
    failedInternal,
    enqueued,
    durationMs: Date.now() - startedAt,
    rawHits,
    hitCount,
    nextStartRecord: next.enqueue ? next.nextStartRecord : null,
  };
}
