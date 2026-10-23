import assert from "node:assert/strict";
import { getServerCache, clearServerCache } from "../lib/server-cache";

async function main() {
  const realNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    clearServerCache();
    let calls = 0;
    const options = { ttlMs: 30, staleWhileRevalidateMs: 100 };
    assert.equal(await getServerCache("org:profile", options, async () => ++calls), 1);
    assert.equal(await getServerCache("org:profile", options, async () => ++calls), 1);
    assert.equal(calls, 1);
    now += 31;
    let finish!: (value: number) => void;
    let background: Promise<unknown> | undefined;
    const refresh = { ...options, keepAlive: (work: Promise<unknown>) => { background = work; } };
    assert.equal(await getServerCache("org:profile", refresh, () => { calls++; return new Promise<number>((resolve) => { finish = resolve; }); }), 1);
    assert.equal(await getServerCache("org:profile", options, async () => 99), 1, "Concurrent stale reads must not duplicate refresh");
    assert.equal(calls, 2);
    finish(2);
    await background;
    assert.equal(await getServerCache("org:profile", options, async () => 99), 2);
    now += 31;
    assert.equal(await getServerCache("org:profile", refresh, async () => { throw new Error("offline"); }), 2);
    await background;
    assert.equal(await getServerCache("org:profile", refresh, async () => 3), 2, "Keep stale data on transient errors");
    await background;
    now += 200;
    assert.equal(await getServerCache("org:profile", options, async () => 4), 4, "Hard-expired entries must be awaited");
    assert.equal(await getServerCache("other-org:profile", options, async () => 9), 9);
    // Invalidation during a running refresh must not resurrect old state.
    now += 31;
    await getServerCache("org:profile", refresh, () => new Promise<number>((resolve) => { finish = resolve; }));
    clearServerCache("org:");
    finish(5);
    await background;
    assert.equal(await getServerCache("org:profile", options, async () => 6), 6);
    clearServerCache();
    let resolveCold!: (value: number) => void;
    const cold = getServerCache("cold", options, () => new Promise<number>((resolve) => { resolveCold = resolve; }));
    await Promise.resolve();
    const second = getServerCache("cold", options, async () => 99);
    resolveCold(7);
    assert.deepEqual(await Promise.all([cold, second]), [7, 7]);
    console.log("Server cache freshness, refresh, error, isolation and invalidation checks passed");
  } finally { Date.now = realNow; clearServerCache(); }
}
void main();
