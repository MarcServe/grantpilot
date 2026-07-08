import assert from "node:assert/strict";
import { buildWhatsAppMessage } from "../lib/notification-templates";
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
assert.match(variables.digestTemplateVariables["2"], /Fresh 85%\+:/);
assert.match(variables.digestTemplateVariables["2"], /AI Innovation Grant/);
assert.doesNotMatch(variables.digestTemplateVariables["2"], /Still eligible reminders/);
assert.equal(variables.digestTemplateVariables["3"], "https://www.grantscopilot.com/grants/eligible");
assert.equal(variables.grantMatchTemplateVariables["1"], "91");
assert.match(variables.grantMatchTemplateVariables["2"], /AI Innovation Grant/);
assert.equal(variables.grantMatchTemplateVariables["3"], "https://www.grantscopilot.com/grants/eligible");

const reminderOnlyVariables = buildDigestWhatsAppTemplateVariables(
  {
    profileName: "Biz Boosters Limited",
    grants: [],
    previousScanGrants: [
      {
        grantId: "grant-3",
        grantName: "Still Open AI Fund",
        score: 90,
        scoringSource: "openai",
        grantAddedAt: "2026-06-28T07:00:00.000Z",
      },
      {
        grantId: "grant-4",
        grantName: "Still Open Growth Fund",
        score: 86,
        scoringSource: "intelligence",
        grantAddedAt: "2026-06-20T07:00:00.000Z",
      },
      {
        grantId: "grant-5",
        grantName: "Below Threshold Reminder",
        score: 80,
        scoringSource: "intelligence",
        grantAddedAt: "2026-06-19T07:00:00.000Z",
      },
    ],
  },
  "https://www.grantscopilot.com"
);

assert.equal(reminderOnlyVariables.strongCount, 2, "reminder-only digest should count 85%+ reminders");
assert.match(reminderOnlyVariables.digestTemplateVariables["2"], /No new 85%\+ today/);
assert.match(reminderOnlyVariables.digestTemplateVariables["2"], /Still eligible reminders:/);
assert.match(reminderOnlyVariables.digestTemplateVariables["2"], /Still Open AI Fund/);
assert.doesNotMatch(reminderOnlyVariables.digestTemplateVariables["2"], /Below Threshold Reminder/);

const plainDigest = buildWhatsAppMessage(
  "grant_scan_digest",
  {
    profileName: "Biz Boosters Limited",
    grants: [
      {
        grantId: "grant-6",
        grantName: "Added Today AI Grant",
        score: 88,
        scoringSource: "openai",
        grantAddedAt: new Date().toISOString(),
      },
    ],
    previousScanGrants: [
      {
        grantId: "grant-7",
        grantName: "Still Eligible Reminder Grant",
        score: 89,
        scoringSource: "intelligence",
        grantAddedAt: "2026-06-10T07:00:00.000Z",
      },
    ],
  },
  "https://www.grantscopilot.com"
);

assert.match(plainDigest, /Added today:/);
assert.match(plainDigest, /Added Today AI Grant/);
assert.match(plainDigest, /Still eligible reminders:/);
assert.match(plainDigest, /Still Eligible Reminder Grant/);
assert.doesNotMatch(plainDigest, /Within reach/);

console.log("whatsapp digest template checks passed");
