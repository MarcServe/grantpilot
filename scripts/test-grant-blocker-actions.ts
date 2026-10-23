import assert from "node:assert/strict";
import { grantBlockerAction } from "../lib/grant-blocker-actions";
const id = "grant /one?";
for (const [text, field, step] of [
  ["Company incorporation date not provided", "incorporationDate", "1"],
  ["Employee count is missing", "employeeCount", "1"],
  ["Legal structure is missing", "legalStructure", "1"],
  ["Annual revenue is unknown", "annualRevenue", "3"],
  ["Co-funding capacity is missing", "coFundingCapacity", "4"],
  ["Upload supporting documents", "documents", "5"],
  ["Confirm verified facts", "eligibilityFacts", "7"],
]) {
  const url = new URL(grantBlockerAction(text, id).href, "https://test.local");
  assert.equal(url.pathname, "/profile");
  assert.equal(url.searchParams.get("field"), field);
  assert.equal(url.searchParams.get("step"), step);
  assert.equal(url.searchParams.get("grantId"), id);
}
assert.match(grantBlockerAction("Start the application or paste funder questions into Founder Pack.", id).href, /^\/grant-assistant\?grantId=/);
assert.match(grantBlockerAction("Prepare the project budget", id).href, /^\/founder-pack\?grantId=/);
assert.match(grantBlockerAction("Confirm the funder deadline and incorporation date", id).href, /^\/grants\//, "Funder checks must not accidentally open company date fields");
assert.match(grantBlockerAction("Only universities can apply", id).href, /^\/grants\//, "A structural restriction must not imply the user can fix it by changing a profile field");
assert.equal(new URL(grantBlockerAction("Unknown requirement", id).href, "https://test.local").hostname, "test.local");
console.log("Grant blocker action routes, field focus and context checks passed");
