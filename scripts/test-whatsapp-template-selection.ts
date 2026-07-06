import assert from "node:assert/strict";
import { resolveWhatsAppTemplateForType } from "../lib/whatsapp-template-config";

const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  TWILIO_WHATSAPP_GRANT_MATCH_CONTENT_SID: "HX_GRANT",
};

const digestWithoutDedicated = resolveWhatsAppTemplateForType("grant_scan_digest", baseEnv);
assert.equal(digestWithoutDedicated.kind, "digest_single_match");
assert.equal(digestWithoutDedicated.contentSid, "HX_GRANT");
assert.equal(
  digestWithoutDedicated.error ?? null,
  null,
  "digest WhatsApp should fall back to the proven single high-score grant template"
);

const digestWithDedicated = resolveWhatsAppTemplateForType("grant_scan_digest", {
  ...baseEnv,
  TWILIO_WHATSAPP_DIGEST_CONTENT_SID: "HX_DIGEST",
});
assert.equal(digestWithDedicated.kind, "digest");
assert.equal(digestWithDedicated.contentSid, "HX_DIGEST");

const grantMatch = resolveWhatsAppTemplateForType("grant_match_high", baseEnv);
assert.equal(grantMatch.kind, "grant_match");
assert.equal(grantMatch.contentSid, "HX_GRANT");

console.log("whatsapp template selection tests passed");
