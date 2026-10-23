// Tab-local storage avoids a cold list on every navigation. The caller supplies
// a server-authenticated user/org/profile scope, including the profile revision.
const PREFIX = "grantpilot.matches.v1:";
export const MATCH_CACHE_FRESH_MS = 30_000;
export const MATCH_CACHE_MAX_AGE_MS = 5 * 60_000;
const MAX_ENTRIES = 30;

export function matchesCacheKey(scope: string, tier: string, page: number, pageSize: number): string {
  return `${PREFIX}${scope}:${tier}:${page}:${pageSize}`;
}

export function readMatchesCache<T>(storage: Storage, key: string, now = Date.now()): { value: T; stale: boolean } | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const age = now - entry.savedAt;
    if (!Number.isFinite(age) || age < 0 || age > MATCH_CACHE_MAX_AGE_MS || !Array.isArray(entry.value?.grants)) {
      storage.removeItem(key);
      return null;
    }
    return { value: entry.value as T, stale: age >= MATCH_CACHE_FRESH_MS };
  } catch { return null; }
}

export function writeMatchesCache<T>(storage: Storage, key: string, value: T): void {
  try {
    storage.removeItem(key);
    storage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((item): item is string => Boolean(item?.startsWith(PREFIX)));
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) storage.removeItem(old);
  } catch { /* Storage quota/privacy settings must not prevent loading. */ }
}

export function clearMatchesCache(storage: Storage, scope: string): void {
  try {
    const prefix = `${PREFIX}${scope}:`;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) if (key?.startsWith(prefix)) storage.removeItem(key);
  } catch { /* Cache is optional. */ }
}
