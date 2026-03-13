/**
 * Grant discovery queue: enqueue candidate URLs, fetch pending, mark crawled/failed.
 */

import { getSupabaseAdmin } from "@/lib/supabase";

export interface DiscoveryQueueRow {
  id: string;
  url: string;
  status: string;
  source: string | null;
  discovered_at: string;
  crawled_at: string | null;
  error_message: string | null;
}

/**
 * Enqueue a URL if not already present. Returns true if inserted.
 */
export async function enqueueDiscoveryUrl(
  url: string,
  source?: string | null
): Promise<{ id: string; inserted: boolean }> {
  const supabase = getSupabaseAdmin();
  const normalized = url.trim();
  if (!normalized) throw new Error("Discovery URL cannot be empty");

  const { data: existing } = await supabase
    .from("grant_discovery_queue")
    .select("id")
    .eq("url", normalized)
    .maybeSingle();

  if (existing) return { id: existing.id, inserted: false };

  const { data: row, error } = await supabase
    .from("grant_discovery_queue")
    .insert({
      url: normalized,
      status: "pending",
      source: source ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !row) throw new Error(error?.message ?? "Failed to enqueue URL");
  return { id: row.id, inserted: true };
}

/**
 * Enqueue multiple URLs; skip duplicates. Returns count of newly inserted.
 */
export async function enqueueDiscoveryUrls(
  urls: string[],
  source?: string | null
): Promise<number> {
  let inserted = 0;
  for (const url of urls) {
    try {
      const { inserted: ok } = await enqueueDiscoveryUrl(url, source);
      if (ok) inserted++;
    } catch (e) {
      console.warn("[grant-discovery-queue] enqueue skip:", url, e);
    }
  }
  return inserted;
}

/**
 * Fetch up to limit pending queue rows, ordered by discovered_at.
 */
export async function getPendingDiscoveryUrls(
  limit: number
): Promise<DiscoveryQueueRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("grant_discovery_queue")
    .select("id, url, status, source, discovered_at, crawled_at, error_message")
    .eq("status", "pending")
    .order("discovered_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`grant_discovery_queue query failed: ${error.message}`);
  return (data ?? []) as DiscoveryQueueRow[];
}

/**
 * Mark a queue row as crawled.
 */
export async function markDiscoveryCrawled(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("grant_discovery_queue")
    .update({
      status: "crawled",
      crawled_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`markDiscoveryCrawled failed: ${error.message}`);
}

/**
 * Mark a queue row as failed with an error message.
 */
export async function markDiscoveryFailed(id: string, errorMessage: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("grant_discovery_queue")
    .update({
      status: "failed",
      crawled_at: new Date().toISOString(),
      error_message: errorMessage.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`markDiscoveryFailed failed: ${error.message}`);
}
