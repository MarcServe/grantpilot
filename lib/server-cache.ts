type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

const DEFAULT_MAX_ENTRIES = 250;
const cacheStore = new Map<string, CacheEntry<unknown>>();

function pruneExpired(now = Date.now()) {
  for (const [key, entry] of cacheStore.entries()) {
    if (entry.expiresAt <= now && !entry.promise) {
      cacheStore.delete(key);
    }
  }
}

function trimToMaxEntries(maxEntries: number) {
  while (cacheStore.size > maxEntries) {
    const oldestKey = cacheStore.keys().next().value as string | undefined;
    if (!oldestKey) return;
    cacheStore.delete(oldestKey);
  }
}

export async function getServerCache<T>(
  key: string,
  options: { ttlMs: number; maxEntries?: number },
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  pruneExpired(now);

  const existing = cacheStore.get(key) as CacheEntry<T> | undefined;
  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }
  if (existing?.promise && existing.expiresAt > now) {
    return existing.promise;
  }

  const promise = loader()
    .then((value) => {
      cacheStore.set(key, { value, expiresAt: Date.now() + options.ttlMs });
      trimToMaxEntries(maxEntries);
      return value;
    })
    .catch((error) => {
      cacheStore.delete(key);
      throw error;
    });

  cacheStore.set(key, { promise, expiresAt: now + options.ttlMs });
  trimToMaxEntries(maxEntries);
  return promise;
}

export function clearServerCache(prefix?: string) {
  if (!prefix) {
    cacheStore.clear();
    return;
  }
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) cacheStore.delete(key);
  }
}
