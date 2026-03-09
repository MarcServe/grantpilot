/** Normalise to E.164 for Twilio (e.g. 07123456789 -> +447123456789). */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    return `+44${digits.slice(1)}`;
  }
  if (!phone.startsWith("+")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export interface SendWhatsAppResult {
  success: boolean;
  error?: string;
  /** Twilio message SID for lookup in Twilio Console (Message Logs) */
  twilioSid?: string;
  /** Twilio status: queued, sent, delivered, failed, undelivered */
  twilioStatus?: string;
}

/**
 * Send WhatsApp using a Twilio Content Template (approved template SID).
 * Use for grant_match / grant_match_high when TWILIO_WHATSAPP_GRANT_MATCH_CONTENT_SID is set.
 * contentVariables: keys match template placeholders, e.g. { "3": grantUrl } for {{3}}.
 */
export async function sendWhatsAppWithTemplate(
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>
): Promise<SendWhatsAppResult> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.warn("[WHATSAPP] Twilio credentials not set, skipping");
      return { success: false, error: "Twilio not configured" };
    }

    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);
    const toE164Formatted = toE164(to);
    const fromE164Formatted = toE164(fromNumber);

    const twilioMessage = await client.messages.create({
      from: `whatsapp:${fromE164Formatted}`,
      to: `whatsapp:${toE164Formatted}`,
      contentSid,
      contentVariables: JSON.stringify(contentVariables),
    });

    const sid = twilioMessage.sid ?? undefined;
    const status = (twilioMessage as { status?: string }).status ?? undefined;
    if (sid && status && status !== "delivered") {
      console.info("[WHATSAPP] Template message accepted by Twilio", { sid, status, to: toE164Formatted });
    }
    return { success: true, twilioSid: sid, twilioStatus: status };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function sendWhatsApp(
  to: string,
  message: string
): Promise<SendWhatsAppResult> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.warn("[WHATSAPP] Twilio credentials not set, skipping");
      return { success: false, error: "Twilio not configured" };
    }

    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);
    const toE164Formatted = toE164(to);
    const fromE164Formatted = toE164(fromNumber);

    const twilioMessage = await client.messages.create({
      from: `whatsapp:${fromE164Formatted}`,
      to: `whatsapp:${toE164Formatted}`,
      body: message,
    });

    const sid = twilioMessage.sid ?? undefined;
    const status = (twilioMessage as { status?: string }).status ?? undefined;
    if (sid && status && status !== "delivered") {
      console.info("[WHATSAPP] Message accepted by Twilio", { sid, status, to: toE164Formatted });
    }
    return { success: true, twilioSid: sid, twilioStatus: status };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
