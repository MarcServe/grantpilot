import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[EMAIL] RESEND_API_KEY not set, skipping email");
      return { success: false, error: "RESEND_API_KEY not configured" };
    }

    const resend = getResend();
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Grants-Copilot <noreply@grantpilot.co.uk>",
      to,
      subject,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
