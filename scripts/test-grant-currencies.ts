import assert from "node:assert/strict";
import { resolveGrantCurrency } from "../lib/grant-currency";
import { resolveGrantFundingValue, summarizeGrantValues, grantCurrencyTotalLines, formatGrantFundingValue, comparableAwardAverages } from "../lib/grant-value";
assert.equal(resolveGrantCurrency({ currency: "gbp" }), "GBP");
assert.equal(resolveGrantCurrency({ fundingValueEvidence: "Up to £25,000" }), "GBP");
assert.equal(resolveGrantCurrency({ description: "Funding of EUR 200,000" }), "EUR");
assert.equal(resolveGrantCurrency({ eligibility: "Budget: US$100,000" }), "USD");
assert.equal(resolveGrantCurrency({ description: "CA$100,000" }), "CAD");
assert.equal(resolveGrantCurrency({ description: "A$100,000" }), "AUD");
assert.equal(resolveGrantCurrency({ description: "NZ$100,000" }), "NZD");
assert.equal(resolveGrantCurrency({ fundingValueEvidence: "JPY" }), "JPY");
assert.equal(resolveGrantCurrency({ fundingValueEvidence: "Currency: CHF" }), "CHF");
assert.equal(resolveGrantCurrency({ description: "$100,000 for applicants worldwide" }), null);
assert.equal(resolveGrantCurrency({ description: "GBP 50,000 or EUR 60,000" }), null);
assert.equal(resolveGrantCurrency({ description: "ALL businesses should TRY applying" }), null);
const inputs = [
  { applicantMaxAmount: 100, currency: "GBP", opportunityType: "grant" },
  { applicantMaxAmount: 200, currency: "EUR", opportunityType: "grant" },
  { amount: 300, currency: "USD", opportunityType: "grant" },
  { amount: 50 },
  { programmeTotalAmount: 5000000, currency: "EUR" },
];
const summary = summarizeGrantValues(inputs);
assert.equal(summary.total, 0, "mixed currencies never produce a combined numeric total");
assert.deepEqual(summary.currencyTotals, [{ currency: "EUR", total: 200, count: 1 }, { currency: "GBP", total: 100, count: 1 }]);
assert.deepEqual(summary.listedCurrencyTotals, [{ currency: "USD", total: 300, count: 1 }]);
assert.equal(summary.unknownCurrencyCount, 1);
assert.equal(summary.knownCount, 2);
assert.match(grantCurrencyTotalLines(summary).join("\n"), /excluded from totals/);
assert.match(formatGrantFundingValue(resolveGrantFundingValue({ amount: 25000, fundingValueEvidence: "£25,000" })), /GBP\s*25,000/);
assert.equal(comparableAwardAverages(inputs).length, 2, "averages retain currency and exclude unclassified values");
console.log("Mixed-currency totals, explicit source currencies and ambiguous-dollar safeguards passed");
