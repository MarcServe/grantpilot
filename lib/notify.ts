import { sendEmail } from "./email";
import { sendWhatsApp, sendWhatsAppWithTemplate } from "./whatsapp";
import { getSupabaseAdmin } from "./supabase";
import { buildEmailHtml, buildWhatsAppMessage } from "./notification-templates";

interface NotifyUser {
  id: string;
  email: string;
  phoneNumber: string | null;
  whatsappOptIn: boolean;
}

export type NotificationType =
  | "application_started"
  | "review_required"
  | "application_submitted"
  | "application_failed"
  | "deadline_reminder"
  | "welcome"
  | "grant_match"
  | "grant_match_high"
  | "grant_scan_digest"
  | "subscription_activated"
  | "subscription_upgraded"
  | "subscription_cancelled";

export interface DigestGrantItem {
  grantId: string;
  grantName: string;
  score: number;
  summary?: string;
  startApplicationToken?: string;
  /** Labels of required documents the user has not uploaded (for reminder in digest). */
  missingDocuments?: string[];
}

export interface NotificationPayload {
  grantName?: string;
  grantId?: string;
  applicationId?: string;
  deadline?: string;
  appUrl?: string;
  /** Eligibility score 0-100 for grant_match_high */
  score?: number;
  /** One-time token for approve-by-link (e.g. from WhatsApp/email) */
  approveToken?: string;
  /** Token for start-application-by-link (deadline_reminder, digest) */
  startApplicationToken?: string;
  /** For grant_scan_digest: list of grants with View + Start application links */
  grants?: DigestGrantItem[];
  /** Business/profile name for digest subject and body */
  profileName?: string;
  /** Subscription plan name for billing notifications */
  planName?: string;
}

export interface NotifyOptions {
  /** When false, skip WhatsApp for this notification (e.g. org preference for eligibility digest). */
  sendWhatsApp?: boolean;
}

export async function notifyUser(
  user: NotifyUser,
  type: NotificationType,
  payload: NotificationPayload,
  options?: NotifyOptions
): Promise<void> {
  const appUrl = payload.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://grantpilot.co.uk";

  const supabase = getSupabaseAdmin();

  if (user.email) {
    const { subject, html } = buildEmailHtml(type, payload, appUrl);
    const result = await sendEmail(user.email, subject, html);
    await supabase.from("NotificationLog").insert({
      userId: user.id,
      channel: "email",
      type,
      status: result.success ? "sent" : "failed",
      error: result.error ?? null,
    });
  }

  if (options?.sendWhatsApp === false) {
    // Org opted out of WhatsApp for this notification type (e.g. eligibility digest).
  } else if (user.whatsappOptIn && user.phoneNumber) {
    const grantMatchSid = (process.env.TWILIO_WHATSAPP_GRANT_MATCH_CONTENT_SID ?? "").trim();
    const deadlineSid = (process.env.TWILIO_WHATSAPP_DEADLINE_CONTENT_SID ?? "").trim();

    const useGrantTemplate =
      (type === "grant_match" || type === "grant_match_high") && grantMatchSid.length > 0;
    const useDeadlineTemplate = type === "deadline_reminder" && deadlineSid.length > 0;

    // WhatsApp business-initiated messages require Content Templates (Twilio 63016). Never use body.
    if (useGrantTemplate) {
      const grantUrl = payload.grantId ? `${appUrl}/grants/${payload.grantId}` : `${appUrl}/grants`;
      const result = await sendWhatsAppWithTemplate(user.phoneNumber, grantMatchSid, {
        "1": grantUrl,
        "2": grantUrl,
        "3": grantUrl,
      });
      const logPayload: Record<string, unknown> = {
        userId: user.id,
        channel: "whatsapp",
        type,
        status: result.success ? "sent" : "failed",
        error: result.error ?? null,
      };
      if (result.twilioSid ?? result.twilioStatus) {
        logPayload.metadata = { twilioSid: result.twilioSid ?? null, twilioStatus: result.twilioStatus ?? null };
      }
      await supabase.from("NotificationLog").insert(logPayload);
    } else if (useDeadlineTemplate) {
      const startUrl = payload.startApplicationToken
        ? `${appUrl}/start-application?token=${encodeURIComponent(payload.startApplicationToken)}`
        : `${appUrl}/grants/${payload.grantId ?? ""}`;
      const result = await sendWhatsAppWithTemplate(user.phoneNumber, deadlineSid, {
        "1": payload.grantName ?? "Grant",
        "2": payload.deadline ?? "soon",
        "3": startUrl,
      });
      const logPayload: Record<string, unknown> = {
        userId: user.id,
        channel: "whatsapp",
        type,
        status: result.success ? "sent" : "failed",
        error: result.error ?? null,
      };
      if (result.twilioSid ?? result.twilioStatus) {
        logPayload.metadata = { twilioSid: result.twilioSid ?? null, twilioStatus: result.twilioStatus ?? null };
      }
      await supabase.from("NotificationLog").insert(logPayload);
    } else {
      await supabase.from("NotificationLog").insert({
        userId: user.id,
        channel: "whatsapp",
        type,
        status: "skipped",
        error: "whatsapp_requires_template",
      });
    }
  } else if (user.whatsappOptIn && !user.phoneNumber) {
    await supabase.from("NotificationLog").insert({
      userId: user.id,
      channel: "whatsapp",
      type,
      status: "skipped",
      error: "no_phone",
    });
  } else if (!user.whatsappOptIn && user.phoneNumber) {
    await supabase.from("NotificationLog").insert({
      userId: user.id,
      channel: "whatsapp",
      type,
      status: "skipped",
      error: "not_opted_in",
    });
  }
}

function toNotifyUser(raw: Record<string, unknown> | null | undefined): NotifyUser | null {
  if (!raw) return null;
  const id = (raw.id ?? raw.user_id) as string | undefined;
  const email = (raw.email as string) ?? "";
  const phoneNumber = (raw.phoneNumber ?? raw.phone_number) as string | null | undefined;
  const whatsappOptIn = Boolean(raw.whatsappOptIn ?? raw.whatsapp_opt_in);
  if (!id || !email) return null;
  return {
    id,
    email,
    phoneNumber: phoneNumber ?? null,
    whatsappOptIn,
  };
}

/**
 * Notify all members of an organisation (excluding viewers).
 */
export async function notifyOrgMembers(
  organisationId: string,
  type: NotificationType,
  payload: NotificationPayload,
  options?: NotifyOptions
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const userColumns = "id, email, phoneNumber, whatsappOptIn";
  let { data: members = [] } = await supabase
    .from("OrganisationMember")
    .select(`*, User(${userColumns})`)
    .eq("organisationId", organisationId)
    .neq("role", "VIEWER");

  if (!members?.length) {
    const alt = await supabase
      .from("OrganisationMember")
      .select(`*, User(${userColumns})`)
      .eq("organisation_id", organisationId)
      .neq("role", "VIEWER");
    members = alt.data ?? [];
  }
  if (!members?.length) {
    const altSnake = await supabase
      .from("OrganisationMember")
      .select("*, User(id, email, phone_number, whatsapp_opt_in)")
      .eq("organisation_id", organisationId)
      .neq("role", "VIEWER");
    members = altSnake.data ?? [];
  }

  const list = Array.isArray(members) ? members : [];
  const withUser = list
    .map((m: Record<string, unknown>) => toNotifyUser((m.User ?? m.user) as Record<string, unknown> | null))
    .filter((u): u is NotifyUser => u != null);

  await Promise.allSettled(
    withUser.map((u) => notifyUser(u, type, payload, options))
  );
}
