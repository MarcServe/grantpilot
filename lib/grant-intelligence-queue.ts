import { grantContentHashForEligibility } from "@/lib/eligibility-ai-cache";
import { extractGrantIntelligence, upsertGrantIntelligence, type GrantForIntelligence } from "@/lib/grant-intelligence-extract";
import { normalizeGrantIntelligence } from "@/lib/grant-intelligence-schema";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { getSupabaseAdmin } from "@/lib/supabase";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type QueueRow = {
  id: string;
  grant_id: string;
  attempts: number | null;
};

export type GrantIntelligenceQueueStats = {
  requested: number;
  enqueued: number;
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
};

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const GRANT_INTELLIGENCE_BATCH_SIZE = positiveIntFromEnv("GRANT_INTELLIGENCE_BATCH_SIZE", 25);
const GRANT_INTELLIGENCE_RECENT_WINDOW_DAYS = positiveIntFromEnv("GRANT_INTELLIGENCE_RECENT_WINDOW_DAYS", 31);
const GRANT_INTELLIGENCE_RECENCY_BONUS = positiveIntFromEnv("GRANT_INTELLIGENCE_RECENCY_BONUS", 300);

type IntelligenceCacheRow = {
  grant_id: string;
  content_hash?: string | null;
  status?: string | null;
  updated_at?: string | null;
};

function priorityForGrant(grant: GrantForIntelligence): number {
  const deadline = grant.deadline ? new Date(grant.deadline).getTime() : 0;
  const deadlineBonus = Number.isFinite(deadline) && deadline > Date.now() ? 100 : 0;
  const applicationUrlBonus = grant.applicationUrl ? 20 : 0;
  const createdAt = grant.createdAt ? new Date(grant.createdAt).getTime() : 0;
  const ageMs = Number.isFinite(createdAt) && createdAt > 0 ? Math.max(0, Date.now() - createdAt) : Infinity;
  const recentWindowMs = GRANT_INTELLIGENCE_RECENT_WINDOW_DAYS * 86_400_000;
  const recencyBonus = ageMs <= recentWindowMs
    ? Math.round(GRANT_INTELLIGENCE_RECENCY_BONUS * (1 - ageMs / recentWindowMs))
    : 0;
  return deadlineBonus + applicationUrlBonus + recencyBonus;
}

async function markQueueRow(supabase: SupabaseAdmin, id: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from("grant_intelligence_queue")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function enqueueGrantsForIntelligence(options?: {
  supabase?: SupabaseAdmin;
  limit?: number;
  source?: string;
}): Promise<{ requested: number; enqueued: number; error?: string }> {
  const supabase = options?.supabase ?? getSupabaseAdmin();
  const limit = Math.max(1, Math.min(1000, options?.limit ?? 500));
  const source = options?.source ?? "grant_intelligence_cron";

  try {
    const { data: pendingIntelligence, error: pendingIntelligenceError } = await supabase
      .from("grant_ai_intelligence")
      .select("grant_id, content_hash, status, updated_at")
      .in("status", ["pending", "failed", "stale"])
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (pendingIntelligenceError) throw pendingIntelligenceError;

    const pendingGrantIds = Array.from(
      new Set(((pendingIntelligence ?? []) as IntelligenceCacheRow[]).map((row) => row.grant_id).filter(Boolean))
    );

    const latestLimit = Math.max(0, limit - pendingGrantIds.length);
    const latestGrantsResult = latestLimit > 0
      ? await supabase
          .from("Grant")
          .select("id, name, funder, amount, deadline, applicationUrl, eligibility, description, objectives, applicantTypes, sectors, regions, url_status, createdAt")
          .order("createdAt", { ascending: false })
          .limit(latestLimit)
      : { data: [], error: null };
    if (latestGrantsResult.error) throw latestGrantsResult.error;

    const pendingGrantsResult = pendingGrantIds.length > 0
      ? await supabase
          .from("Grant")
          .select("id, name, funder, amount, deadline, applicationUrl, eligibility, description, objectives, applicantTypes, sectors, regions, url_status, createdAt")
          .in("id", pendingGrantIds)
      : { data: [], error: null };
    if (pendingGrantsResult.error) throw pendingGrantsResult.error;

    const grantsById = new Map<string, GrantForIntelligence>();
    for (const grant of [
      ...((pendingGrantsResult.data ?? []) as GrantForIntelligence[]),
      ...((latestGrantsResult.data ?? []) as GrantForIntelligence[]),
    ]) {
      if (grant.id && isGrantActionableNow(grant)) grantsById.set(grant.id, grant);
    }
    const grants = Array.from(grantsById.values());
    if (grants.length === 0) return { requested: 0, enqueued: 0 };

    const grantIds = grants.map((grant) => grant.id);
    const [{ data: existingIntelligence }, { data: existingQueue }] = await Promise.all([
      supabase
        .from("grant_ai_intelligence")
        .select("grant_id, content_hash, status")
        .in("grant_id", grantIds),
      supabase
        .from("grant_intelligence_queue")
        .select("grant_id, status")
        .in("grant_id", grantIds)
        .in("status", ["pending", "running"]),
    ]);

    const intelligenceByGrant = new Map(
      ((existingIntelligence ?? []) as Array<{ grant_id: string; content_hash?: string | null; status?: string | null }>)
        .map((row) => [row.grant_id, row])
    );
    const queued = new Set(((existingQueue ?? []) as Array<{ grant_id: string }>).map((row) => row.grant_id));

    const rows = grants
      .filter((grant) => {
        if (queued.has(grant.id)) return false;
        const hash = grantContentHashForEligibility(grant);
        const existing = intelligenceByGrant.get(grant.id);
        return !existing || existing.status !== "ready" || existing.content_hash !== hash;
      })
      .map((grant) => ({
        grant_id: grant.id,
        status: "pending",
        priority: priorityForGrant(grant),
        source,
        attempts: 0,
        content_hash: grantContentHashForEligibility(grant),
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0) return { requested: grants.length, enqueued: 0 };

    const { error: upsertError } = await supabase.from("grant_intelligence_queue").upsert(rows, {
      onConflict: "grant_id",
    });
    if (upsertError) throw upsertError;
    return { requested: grants.length, enqueued: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[grant-intelligence-queue] enqueue failed:", message);
    return { requested: 0, enqueued: 0, error: message };
  }
}

export async function processGrantIntelligenceQueue(options?: {
  supabase?: SupabaseAdmin;
  limit?: number;
}): Promise<GrantIntelligenceQueueStats> {
  const supabase = options?.supabase ?? getSupabaseAdmin();
  const limit = Math.max(1, Math.min(100, options?.limit ?? GRANT_INTELLIGENCE_BATCH_SIZE));
  const empty = { requested: 0, enqueued: 0, processed: 0, completed: 0, failed: 0, skipped: 0 };

  const { data, error } = await supabase
    .from("grant_intelligence_queue")
    .select("id, grant_id, attempts")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as QueueRow[];
  if (rows.length === 0) return empty;

  await supabase
    .from("grant_intelligence_queue")
    .update({ status: "running", locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in("id", rows.map((row) => row.id));

  const { data: grantsData, error: grantsError } = await supabase
    .from("Grant")
    .select("id, name, funder, amount, deadline, applicationUrl, eligibility, description, objectives, applicantTypes, sectors, regions, url_status")
    .in("id", rows.map((row) => row.grant_id));
  if (grantsError) throw grantsError;
  const grantsById = new Map(((grantsData ?? []) as GrantForIntelligence[]).map((grant) => [grant.id, grant]));

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const grant = grantsById.get(row.grant_id);
      if (!grant) {
        skipped++;
        await markQueueRow(supabase, row.id, { status: "skipped", last_error: "Grant row no longer exists." });
        continue;
      }

      if (!isGrantActionableNow(grant)) {
        skipped++;
        await upsertGrantIntelligence(supabase, grant, normalizeGrantIntelligence({
          status: "stale",
          confidence: 85,
          reusableSummary: `${grant.name} is not currently actionable.`,
          freshness: { status: "stale", deadline: grant.deadline ?? null, evidence: ["Local actionability check failed."] },
          scoringHints: { redFlags: ["Expired or non-actionable source"] },
        }));
        await markQueueRow(supabase, row.id, { status: "skipped", completed_at: new Date().toISOString(), last_error: "Grant is not actionable." });
        continue;
      }

      const intelligence = await extractGrantIntelligence(grant);
      await upsertGrantIntelligence(supabase, grant, intelligence);
      completed++;
      await markQueueRow(supabase, row.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        last_error: null,
      });
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      await markQueueRow(supabase, row.id, {
        status: "failed",
        attempts: (row.attempts ?? 0) + 1,
        last_error: message.slice(0, 1000),
      });
    }
  }

  return {
    requested: 0,
    enqueued: 0,
    processed: rows.length,
    completed,
    failed,
    skipped,
  };
}
