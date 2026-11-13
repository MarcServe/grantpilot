import assert from "node:assert/strict";
import { startUpLoanPreparation, LOAN_DOCUMENTS, START_UP_LOANS } from "../lib/start-up-loans-preparation";
for (const key of Object.keys(LOAN_DOCUMENTS)) {
  const draft = startUpLoanPreparation(key);
  assert.equal(draft.key, key);
  assert.equal(draft.mode, "document_draft");
  assert.match(draft.questions[0].question, /not a grant/);
  assert.match(draft.context, /not a transcript|no access to private portal/);
  assert.match(draft.context, /TO CONFIRM/);
  assert.match(draft.context, /7\.5%/);
  assert.match(draft.context, /60 months/);
}
assert.equal(startUpLoanPreparation("__proto__").key, "business-plan");
assert.equal(startUpLoanPreparation("invalid").key, "business-plan");
assert.match(startUpLoanPreparation("personal-budget").questions[0].question, /cannot be inferred from company revenue/);
assert.match(startUpLoanPreparation("cash-flow").questions[0].question, /not a verified financial model/);
assert.equal(new URL(START_UP_LOANS.apply).hostname, "apply.startuploans.co.uk");
console.log("Loan draft selection, official links, missing evidence and personal-finance boundaries passed.");
