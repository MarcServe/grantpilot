import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getServerCache } from "@/lib/server-cache";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

function hashKey(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function uniqueSortedIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))].sort();
}

export async function fetchCachedGrantRowsByIds<T extends { id: string }>({
  supabase,
  ids,
  select,
  batchSize = 80,
  ttlMs = 60_000,
  cacheNamespace = "grant-records",
}: {
  supabase: SupabaseAdmin;
  ids: string[];
  select: string;
  batchSize?: number;
  ttlMs?: number;
  cacheNamespace?: string;
}): Promise<Map<string, T>> {
  const uniqueIds = uniqueSortedIds(ids);
  const rows: T[] = [];
  const selectHash = hashKey(select);

  // Bound parallelism: avoid one network round trip per batch while keeping
  // database load predictable for large profiles.
  const size = Math.max(1, batchSize);
  for (let group = 0; group < uniqueIds.length; group += size * 4) {
    const results = await Promise.all([0, 1, 2, 3].map(async (index) => {
      const start = group + index * size;
      const batch = uniqueIds.slice(start, start + size);
      if (!batch.length) return [] as T[];
      const batchKey = `${cacheNamespace}:${selectHash}:${hashKey(batch.join(","))}`;
      return getServerCache<T[]>(batchKey, { ttlMs, maxEntries: 300 }, async () => {
        const { data, error } = await supabase.from("Grant").select(select).in("id", batch);
        if (error) throw new Error(`Grant records could not be loaded: ${error.message}`);
        return (data ?? []) as unknown as T[];
      });
    }));
    rows.push(...results.flat());
  }

  return new Map(rows.map((row) => [row.id, row]));
}
