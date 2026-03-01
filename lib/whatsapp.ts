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

export async function sendWhatsApp(
  to: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
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

    await client.messages.create({
      from: `whatsapp:${fromE164Formatted}`,
      to: `whatsapp:${toE164Formatted}`,
      body: message,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
