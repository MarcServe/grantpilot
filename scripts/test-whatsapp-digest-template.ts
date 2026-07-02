import assert from "node:assert/strict";
import { buildDigestWhatsAppTemplateVariables } from "../lib/whatsapp-digest-template";

const variables = buildDigestWhatsAppTemplateVariables(
  {
    profileName: "Biz Boosters Limited",
    grants: [
      {
        grantId: "grant-1",
        grantName: "AI Innovation Grant",
        score: 91,
        scoringSource: "openai",
        grantAddedAt: "2026-07-02T07:00:00.000Z",
      },
      {
        grantId: "grant-2",
        grantName: "Digital Transformation Fund",
        score: 87,
        scoringSource: "intelligence",
        grantAddedAt: "2026-07-01T07:00:00.000Z",
      },
    ],
    previousScanGrants: [
      {
        grantId: "grant-1",
        grantName: "AI Innovation Grant",
        score: 91,
        scoringSource: "openai",
        grantAddedAt: "2026-07-02T07:00:00.000Z",
      },
    ],
  },
  "https://www.grantscopilot.com"
);

assert.equal(variables.strongCount, 2, "digest template should dedupe strong matches");
assert.equal(variables.digestTemplateVariables["1"], "Biz Boosters Limited");
assert.match(variables.digestTemplateVariables["2"], /2 strong matches/);
assert.equal(variables.digestTemplateVariables["3"], "https://www.grantscopilot.com/grants/eligible");
assert.equal(variables.grantMatchTemplateVariables["1"], "91");
assert.match(variables.grantMatchTemplateVariables["2"], /AI Innovation Grant/);
assert.equal(variables.grantMatchTemplateVariables["3"], "https://www.grantscopilot.com/grants/eligible");

console.log("whatsapp digest template checks passed");
