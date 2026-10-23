type CacheEntry<T> = {
  expiresAt: number;
  staleUntil: number;
  value?: T;
  promise?: Promise<T>;
};
const DEFAULT_MAX_ENTRIES = 250;
const cacheStore = new Map<string, CacheEntry<unknown>>();

function pruneExpired(now: number) {
  for (const [key, entry] of cacheStore) {
    if (entry.staleUntil <= now && !entry.promise) cacheStore.delete(key);
  }
}
function trimToMaxEntries(maxEntries: number) {
  while (cacheStore.size > maxEntries) {
    const oldest = cacheStore.keys().next().value as string | undefined;
    if (!oldest) return;
    cacheStore.delete(oldest);
  }
}

export async function getServerCache<T>(key: string, options: {
  ttlMs: number;
  maxEntries?: number;
  staleWhileRevalidateMs?: number;
  keepAlive?: (work: Promise<unknown>) => void;
}, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  pruneExpired(now);
  const existing = cacheStore.get(key) as CacheEntry<T> | undefined;
  if (existing?.value !== undefined && existing.expiresAt > now) return existing.value;
  const serveStale = existing?.value !== undefined && existing.staleUntil > now;
  if (existing?.promise) return serveStale ? existing.value! : existing.promise;

  const entry: CacheEntry<T> = {
    expiresAt: existing?.expiresAt ?? now,
    staleUntil: existing?.staleUntil ?? now,
    ...(serveStale ? { value: existing!.value } : {}),
  };
  const promise = Promise.resolve().then(loader).then((value) => {
    if (cacheStore.get(key) === entry) {
      const expiresAt = Date.now() + options.ttlMs;
      cacheStore.set(key, { value, expiresAt, staleUntil: expiresAt + (options.staleWhileRevalidateMs ?? 0) });
    }
    return value;
  }).catch((error) => {
    if (cacheStore.get(key) === entry) {
      if (serveStale) cacheStore.set(key, { ...entry, promise: undefined });
      else cacheStore.delete(key);
    }
    throw error;
  });
  entry.promise = promise;
  cacheStore.set(key, entry);
  trimToMaxEntries(options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  if (serveStale) {
    const work = promise.catch(() => undefined);
    options.keepAlive?.(work);
    return existing!.value!;
  }
  return promise;
}

export function clearServerCache(prefix?: string) {
  if (!prefix) { cacheStore.clear(); return; }
  for (const key of cacheStore.keys()) if (key.startsWith(prefix)) cacheStore.delete(key);
}
