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

  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    const batchKey = `${cacheNamespace}:${selectHash}:${hashKey(batch.join(","))}`;
    const batchRows = await getServerCache<T[]>(
      batchKey,
      { ttlMs, maxEntries: 300 },
      async () => {
        const { data, error } = await supabase.from("Grant").select(select).in("id", batch);
        if (error) {
          console.warn("[grant-cache] Grant batch lookup failed:", error.message);
          return [];
        }
        return (data ?? []) as unknown as T[];
      }
    );
    rows.push(...batchRows);
  }

  return new Map(rows.map((row) => [row.id, row]));
}
