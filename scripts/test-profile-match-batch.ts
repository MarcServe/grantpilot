import assert from "node:assert/strict";
import { loadMatchBatch } from "../lib/profile-match-batch";
async function main() {
  const all = Array.from({ length: 193 }, (_, i) => ({ grantId: `grant-${i}` }));
  let calls = 0;
  const loader = async (offset: number) => {
    calls++;
    const rows = all.slice(offset, offset + 80);
    return { scannedCount: rows.length, sections: { suggested: rows, within_reach: [], other: [], needs_review: [], reviewed: [] } } as never;
  };
  let cursor: string | null = null;
  const ids: string[] = [];
  for (let page = 0; page < 20; page++) {
    const before = calls;
    const batch = await loadMatchBatch("suggested", 20, cursor, loader);
    assert.ok(calls - before <= 2, "Never scan the full portfolio in one request");
    assert.ok(batch.grants.length <= 20);
    ids.push(...batch.grants.map((g) => g.grantId));
    cursor = batch.nextCursor;
    if (!batch.hasMore) break;
  }
  assert.deepEqual(ids, all.map((g) => g.grantId), "No skipped or repeated grants across cursor batches");
  calls = 0;
  const empty = await loadMatchBatch("within_reach", 20, null, loader);
  assert.equal(calls, 2);
  assert.equal(empty.grants.length, 0);
  assert.equal(empty.hasMore, true, "An empty window must not claim the entire category is empty");
  assert.equal(empty.nextCursor, "160:0");
  const last = await loadMatchBatch("within_reach", 20, empty.nextCursor, loader);
  assert.equal(last.hasMore, false);
  await assert.rejects(loadMatchBatch("suggested", 20, "1:0", loader), /Invalid batch cursor/);
  await assert.rejects(loadMatchBatch("suggested", 20, "80:99", loader), /Invalid batch cursor/);
  console.log("Bounded match loading, cursor continuity and empty-window checks passed");
}
void main();
