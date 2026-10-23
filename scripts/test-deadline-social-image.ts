import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createDeadlinePost, deadlinePostDate } from "../lib/deadline-social-image";
async function main() {
  const grant = { name: "EIC Pathfinder Challenge Call", funder: "European Innovation Council", deadline: "2026-10-27T00:00:00Z" };
  assert.deepEqual(deadlinePostDate(grant.deadline), { day: "27 October", year: "2026" });
  assert.throws(() => deadlinePostDate(null), /required/);
  assert.throws(() => deadlinePostDate("rolling"), /required/);
  for (const format of ["square", "portrait"] as const) {
    const response = createDeadlinePost(grant, format);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const header = new DataView(bytes.buffer);
    assert.equal(header.getUint32(16), 1080);
    assert.equal(header.getUint32(20), format === "square" ? 1080 : 1350);
    if (format === "square") await writeFile("/tmp/grantpilot-deadline-preview.png", bytes);
  }
  const long = createDeadlinePost({ ...grant, name: "Digital Twin Industry Challenge Lead Accelerator for research and innovation across the United Kingdom ".repeat(3) }, "square");
  assert.ok((await long.arrayBuffer()).byteLength > 1000);
  console.log("Deadline date validation and square/portrait PNG rendering checks passed");
}
void main();
