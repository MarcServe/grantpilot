import assert from "node:assert/strict";
import { founderPackLabel, loadFounderPackLabels } from "../lib/founder-pack-labels";
const grants = new Map([["g1", "UK Tech Accelerator"], ["g2", "Innovation Fund"]]);
assert.equal(founderPackLabel({}), "Generic funding pack");
assert.equal(founderPackLabel(null), "Generic funding pack");
assert.equal(founderPackLabel({ selectedEligibleGrantIds: ["g1"] }, undefined, grants), "Grant — UK Tech Accelerator");
assert.equal(founderPackLabel({ selectedApplicationIds: ["a1"] }, new Map([["a1", "UK Tech Accelerator"]])), "Application — UK Tech Accelerator");
assert.equal(founderPackLabel({ selectedEligibleGrantIds: ["g1", "g2", "g1"] }, undefined, grants), "Grant — UK Tech Accelerator + 1 more");
assert.equal(founderPackLabel({ selectedEligibleGrantIds: ["deleted"] }), "Grant pack — linked grant unavailable");
assert.equal(founderPackLabel({ packName: "Grant — Saved name", selectedEligibleGrantIds: ["g1"] }, undefined, grants), "Grant — Saved name");
async function main() {
  let scoped = false;
  const db = { from(table: string) {
    assert.equal(table, "Application");
    return { select() { return this; }, eq(column: string, value: string) {
      assert.equal(column, "organisationId"); assert.equal(value, "org-1"); scoped = true; return this;
    }, async in(column: string, values: string[]) {
      assert.equal(scoped, true); assert.equal(column, "id"); assert.deepEqual(values, ["a1"]);
      return { data: [{ id: "a1", Grant: { name: "UK Tech Accelerator" } }], error: null };
    } };
  } };
  const labels = await loadFounderPackLabels(db as never, "org-1", [{ id: "p1", inputs: { selectedApplicationIds: ["a1"] } }]);
  assert.equal(labels.get("p1"), "Application — UK Tech Accelerator");
  console.log("Founder Pack naming and scoped legacy lookup tests passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
