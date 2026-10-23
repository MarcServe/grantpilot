import assert from "node:assert/strict";
import { fetchCachedGrantRowsByIds } from "../lib/grant-record-cache";
import { clearServerCache } from "../lib/server-cache";
async function main() {
  clearServerCache();
  let active = 0, peak = 0, calls = 0;
  let fail = false;
  const db = { from() { return { select() { return { async in(_column: string, ids: string[]) {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return fail ? { data: null, error: { message: "offline" } } : { data: ids.map((id) => ({ id })), error: null };
  } }; } }; } };
  const options = { supabase: db as never, ids: Array.from({ length: 400 }, (_, i) => `g${i}`), select: "id", batchSize: 50 };
  assert.equal((await fetchCachedGrantRowsByIds(options)).size, 400);
  assert.equal(peak, 4, "Use bounded parallel batches");
  assert.equal(calls, 8);
  assert.equal((await fetchCachedGrantRowsByIds(options)).size, 400);
  assert.equal(calls, 8, "Reuse warm grant batches");
  fail = true;
  await assert.rejects(fetchCachedGrantRowsByIds({ ...options, ids: ["new-grant"] }), /offline/);
  fail = false;
  assert.equal((await fetchCachedGrantRowsByIds({ ...options, ids: ["new-grant"] })).size, 1, "Failures must not cache an empty success");
  console.log("Grant batch parallelism, reuse and transient failure checks passed");
}
void main();
