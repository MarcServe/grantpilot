import assert from "node:assert/strict";
import { clearMatchesCache, matchesCacheKey, readMatchesCache, writeMatchesCache, MATCH_CACHE_FRESH_MS, MATCH_CACHE_MAX_AGE_MS } from "../lib/eligible-matches-browser-cache";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}
const store = new MemoryStorage();
const key = matchesCacheKey("user-org-profile-a", "suggested", 1, 20);
const value = { grants: [{ grantId: "g1" }], page: 1, hasMore: true };
writeMatchesCache(store, key, value);
const savedAt = JSON.parse(store.getItem(key)!).savedAt;
assert.deepEqual(readMatchesCache(store, key, savedAt), { value, stale: false });
assert.equal(readMatchesCache(store, key, savedAt + MATCH_CACHE_FRESH_MS)?.stale, true);
assert.equal(readMatchesCache(store, key, savedAt + MATCH_CACHE_MAX_AGE_MS + 1), null);
assert.equal(store.getItem(key), null);
writeMatchesCache(store, key, value);
const otherKey = matchesCacheKey("other-user-org-profile", "suggested", 1, 20);
assert.equal(readMatchesCache(store, otherKey), null);
writeMatchesCache(store, otherKey, value);
clearMatchesCache(store, "user-org-profile-a");
assert.equal(readMatchesCache(store, key), null);
assert.ok(readMatchesCache(store, otherKey));
store.setItem(key, "bad json");
assert.equal(readMatchesCache(store, key), null);
store.setItem(key, JSON.stringify({ savedAt: Date.now(), value: { error: "Unauthorized" } }));
assert.equal(readMatchesCache(store, key), null);
assert.notEqual(key, matchesCacheKey("user-org-profile-a", "suggested", 2, 20));
assert.notEqual(key, matchesCacheKey("user-org-profile-a", "suggested", 1, 50));
store.clear();
for (let i = 0; i < 40; i++) writeMatchesCache(store, matchesCacheKey("scope", "suggested", i, 20), value);
assert.equal(store.length, 30);
assert.doesNotThrow(() => writeMatchesCache({ setItem() { throw new Error("Quota"); }, removeItem() {} } as unknown as Storage, key, value));
console.log("Eligible matches cache checks passed");
