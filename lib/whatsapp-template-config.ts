export type WhatsAppTemplateKind =
  | "grant_match"
  | "digest"
  | "digest_single_match"
  | "deadline"
  | "needs_info"
  | "none";

export type WhatsAppTemplateResolution = {
  kind: WhatsAppTemplateKind;
  contentSid: string | null;
  error?: string;
};

function envValue(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? "").trim();
}

export function getWhatsAppTemplateSids(env: NodeJS.ProcessEnv = process.env) {
  return {
    grantMatchSid: envValue(env, "TWILIO_WHATSAPP_GRANT_MATCH_CONTENT_SID"),
    digestSid:
      envValue(env, "TWILIO_WHATSAPP_DIGEST_CONTENT_SID") ||
      envValue(env, "TWILIO_WHATSAPP_GRANT_DIGEST_CONTENT_SID"),
    deadlineSid:
      envValue(env, "TWILIO_WHATSAPP_DEADLINE_CONTENT_SID") ||
      envValue(env, "TWILIO_WHATSAPP_DEADLINE_TEMPLATE_SID") ||
      envValue(env, "TWILIO_DEADLINE_CONTENT_SID"),
    needsInfoSid: envValue(env, "TWILIO_WHATSAPP_APPLICATION_NEEDS_INFO_CONTENT_SID"),
  };
}

export function resolveWhatsAppTemplateForType(
  type: string,
  env: NodeJS.ProcessEnv = process.env
): WhatsAppTemplateResolution {
  const { grantMatchSid, digestSid, deadlineSid, needsInfoSid } = getWhatsAppTemplateSids(env);

  if ((type === "grant_match" || type === "grant_match_high") && grantMatchSid) {
    return { kind: "grant_match", contentSid: grantMatchSid };
  }
  if (type === "grant_scan_digest") {
    if (digestSid) return { kind: "digest", contentSid: digestSid };
    if (grantMatchSid) return { kind: "digest_single_match", contentSid: grantMatchSid };
    return { kind: "none", contentSid: null, error: "whatsapp_requires_digest_template" };
  }
  if (type === "deadline_reminder" && deadlineSid) {
    return { kind: "deadline", contentSid: deadlineSid };
  }
  if (type === "application_needs_info" && needsInfoSid) {
    return { kind: "needs_info", contentSid: needsInfoSid };
  }

  return { kind: "none", contentSid: null, error: "whatsapp_requires_template" };
}
