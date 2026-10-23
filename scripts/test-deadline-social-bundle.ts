import { deadlineSocialContent } from "../lib/deadline-social-content";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { socialGrantDetails, socialDetailsCsv } from "../lib/deadline-social-bundle";
import { createZip } from "../lib/zip-archive";
async function main() {
  const grant = socialGrantDetails({ id: "g-1", name: '=HYPERLINK("bad")', funder: "Example Fund", deadline: "2026-10-27T00:00:00Z", description: "Details, including commas", programmeTotalAmount: 2000000 });
  assert.match(grant.caption, /Powered by GrantsCopilot/);
  assert.match(grant.caption, /https:\/\/www.grantscopilot.com/);
  assert.match(grant.caption, /27 October 2026/);
  assert.match(grant.award, /Programme-wide fund/);
  assert.doesNotMatch(grant.award, /Applicant maximum/);
  assert.match(grant.caption, /WHO CAN APPLY/);
  assert.match(grant.caption, /HOW GRANTSCOPILOT HELPS/);
  const info = deadlineSocialContent({ name: "Example", funder: null, deadline: null, applicantTypes: ["SMEs"], regions: ["Scotland"], eligibility: "Must have a trading history", applicantMaxAmount: 20000, fundingValueEvidence: "Up to £20,000" });
  assert.match(info.award, /GBP 20,000/);
  assert.match(info.whoQualifies, /SMEs/);
  assert.match(info.whoQualifies, /Scotland/);
  assert.match(info.whoQualifies, /trading history/);
  assert.match(info.help, /prepare grant answers/);
  assert.match(deadlineSocialContent({ name: "Unknown", funder: null, deadline: null }).award, /not stated/);
  const csv = socialDetailsCsv([grant]);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'), "spreadsheet formulas must be neutralised");
  const zip = createZip({ "grant-details.csv": csv, "captions/grant.txt": grant.caption });
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  await writeFile("/tmp/grantpilot-social-test.zip", zip);
  console.log("Social captions, branding, funding labels and CSV formula safeguards passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
