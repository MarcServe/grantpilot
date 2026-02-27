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

    await client.messages.create({
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${to}`,
      body: message,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
