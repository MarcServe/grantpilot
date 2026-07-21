import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveWhatsAppTemplateForType } from "../lib/whatsapp-template-config";

const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  TWILIO_WHATSAPP_GRANT_MATCH_CONTENT_SID: "HX_GRANT",
  TWILIO_WHATSAPP_DIGEST_CONTENT_SID: "",
  TWILIO_WHATSAPP_GRANT_DIGEST_CONTENT_SID: "",
  WHATSAPP_DIGEST_RICH_BODY_FALLBACK_ENABLED: "",
  WHATSAPP_DIGEST_RICH_BODY_FALLBACK_UNTIL: "",
};

const digestWithoutDedicated = resolveWhatsAppTemplateForType("grant_scan_digest", baseEnv);
assert.equal(digestWithoutDedicated.kind, "digest_single_match");
assert.equal(digestWithoutDedicated.contentSid, "HX_GRANT");
assert.equal(digestWithoutDedicated.fallbackExpired ?? false, false);
assert.equal(
  digestWithoutDedicated.error ?? null,
  null,
  "digest WhatsApp should fall back to the proven single high-score grant template"
);

const richBodyTrial = resolveWhatsAppTemplateForType(
  "grant_scan_digest",
  {
    ...baseEnv,
    WHATSAPP_DIGEST_RICH_BODY_FALLBACK_ENABLED: "true",
    WHATSAPP_DIGEST_RICH_BODY_FALLBACK_UNTIL: "2026-07-23T23:59:59+01:00",
  },
  new Date("2026-07-21T12:00:00+01:00")
);
assert.equal(richBodyTrial.kind, "digest_body_trial");
assert.equal(richBodyTrial.contentSid, null);

const expiredRichBodyTrial = resolveWhatsAppTemplateForType(
  "grant_scan_digest",
  {
    ...baseEnv,
    WHATSAPP_DIGEST_RICH_BODY_FALLBACK_ENABLED: "true",
    WHATSAPP_DIGEST_RICH_BODY_FALLBACK_UNTIL: "2026-07-20T23:59:59+01:00",
  },
  new Date("2026-07-21T12:00:00+01:00")
);
assert.equal(expiredRichBodyTrial.kind, "digest_single_match");
assert.equal(expiredRichBodyTrial.contentSid, "HX_GRANT");
assert.equal(expiredRichBodyTrial.fallbackExpired, true);

const digestWithDedicated = resolveWhatsAppTemplateForType("grant_scan_digest", {
  ...baseEnv,
  TWILIO_WHATSAPP_DIGEST_CONTENT_SID: "HX_DIGEST",
  WHATSAPP_DIGEST_RICH_BODY_FALLBACK_ENABLED: "true",
  WHATSAPP_DIGEST_RICH_BODY_FALLBACK_UNTIL: "2026-07-23T23:59:59+01:00",
});
assert.equal(digestWithDedicated.kind, "digest");
assert.equal(digestWithDedicated.contentSid, "HX_DIGEST");

const grantMatch = resolveWhatsAppTemplateForType("grant_match_high", baseEnv);
assert.equal(grantMatch.kind, "grant_match");
assert.equal(grantMatch.contentSid, "HX_GRANT");

const diagnosticsPanel = readFileSync("components/admin/whatsapp-diagnostics-panel.tsx", "utf8");
assert.match(
  diagnosticsPanel,
  /using single-grant fallback/,
  "admin WhatsApp diagnostics should explicitly warn when the dedicated digest template is missing"
);

console.log("whatsapp template selection tests passed");
