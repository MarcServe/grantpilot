import assert from "node:assert/strict";
import { savedPackDocumentTypes, loadFounderPackDraftContext } from "../lib/founder-pack-vault";
import { generateFounderPackExport, type FounderPackExportInput } from "../lib/founder-pack-export";

async function main() {
  assert.deepEqual(savedPackDocumentTypes({ documentTypes: ["business_plan", "invalid", "business_plan"] }).map(x => x.value), ["business_plan"]);
  assert.deepEqual(savedPackDocumentTypes(null), []);
  const content = { businessPlan: "BUSINESS_PLAN_REFERENCE", executiveSummary: "EXECUTIVE_SUMMARY_REFERENCE" };
  const filters: Record<string, string> = {};
  const query = {
    select() { return this; },
    eq(key: string, value: string) { filters[key] = value; return this; },
    order() { return this; },
    async limit(value: number) {
      assert.equal(value, 3);
      return { data: [{ id: "pack-1", createdAt: "2026-10-23", inputs: { documentTypes: ["business_plan"] }, content }], error: null };
    },
  };
  const db = { from(table: string) { assert.equal(table, "FounderFundingPack"); return query; } };
  const reference = await loadFounderPackDraftContext(db as never, "org-1", "profile-1");
  assert.deepEqual(filters, { organisationId: "org-1", profileId: "profile-1" });
  assert.match(reference, /UNVERIFIED/);
  assert.match(reference, /BUSINESS_PLAN_REFERENCE/);
  assert.doesNotMatch(reference, /EXECUTIVE_SUMMARY_REFERENCE/);
  assert.match(reference, /take precedence/);
  const input = { id: "pack-1", inputs: { documentTypes: ["business_plan"] }, content } as FounderPackExportInput;
  const word = generateFounderPackExport(input, "docx");
  assert.ok(word.length > 100);
  const pdf = generateFounderPackExport(input, "pdf");
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const markdown = generateFounderPackExport(input, "md").toString();
  assert.match(markdown, /BUSINESS_PLAN_REFERENCE/);
  assert.doesNotMatch(markdown, /EXECUTIVE_SUMMARY_REFERENCE/);
  console.log("Founder Pack vault scoping, draft context and document exports passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
