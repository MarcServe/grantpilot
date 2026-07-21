export type WhatsAppTemplateKind =
  | "grant_match"
  | "digest"
  | "digest_body_trial"
  | "digest_single_match"
  | "deadline"
  | "needs_info"
  | "none";

export type WhatsAppTemplateResolution = {
  kind: WhatsAppTemplateKind;
  contentSid: string | null;
  error?: string;
  fallbackExpired?: boolean;
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

function envFlagEnabled(env: NodeJS.ProcessEnv, key: string): boolean {
  return ["1", "true", "yes", "on", "enabled"].includes(envValue(env, key).toLowerCase());
}

function richDigestBodyFallbackState(env: NodeJS.ProcessEnv, now: Date) {
  const enabled = envFlagEnabled(env, "WHATSAPP_DIGEST_RICH_BODY_FALLBACK_ENABLED");
  const untilRaw = envValue(env, "WHATSAPP_DIGEST_RICH_BODY_FALLBACK_UNTIL");
  if (!enabled) return { active: false, expired: false };
  if (!untilRaw) return { active: false, expired: true };

  const until = new Date(untilRaw);
  if (Number.isNaN(until.getTime())) return { active: false, expired: true };
  const expired = until.getTime() < now.getTime();
  return { active: !expired, expired };
}

export function resolveWhatsAppTemplateForType(
  type: string,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date()
): WhatsAppTemplateResolution {
  const { grantMatchSid, digestSid, deadlineSid, needsInfoSid } = getWhatsAppTemplateSids(env);

  if ((type === "grant_match" || type === "grant_match_high") && grantMatchSid) {
    return { kind: "grant_match", contentSid: grantMatchSid };
  }
  if (type === "grant_scan_digest") {
    if (digestSid) return { kind: "digest", contentSid: digestSid };
    const richBodyFallback = richDigestBodyFallbackState(env, now);
    if (richBodyFallback.active) return { kind: "digest_body_trial", contentSid: null };
    if (grantMatchSid) {
      return {
        kind: "digest_single_match",
        contentSid: grantMatchSid,
        fallbackExpired: richBodyFallback.expired,
      };
    }
    return {
      kind: "none",
      contentSid: null,
      error: "whatsapp_requires_digest_template",
      fallbackExpired: richBodyFallback.expired,
    };
  }
  if (type === "deadline_reminder" && deadlineSid) {
    return { kind: "deadline", contentSid: deadlineSid };
  }
  if (type === "application_needs_info" && needsInfoSid) {
    return { kind: "needs_info", contentSid: needsInfoSid };
  }

  return { kind: "none", contentSid: null, error: "whatsapp_requires_template" };
}
