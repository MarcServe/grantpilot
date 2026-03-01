import { sendEmail } from "./email";
import { sendWhatsApp } from "./whatsapp";
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
  | "grant_match";

export interface NotificationPayload {
  grantName?: string;
  applicationId?: string;
  deadline?: string;
  appUrl?: string;
  /** One-time token for approve-by-link (e.g. from WhatsApp/email) */
  approveToken?: string;
}

export async function notifyUser(
  user: NotifyUser,
  type: NotificationType,
  payload: NotificationPayload
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

  if (user.whatsappOptIn && user.phoneNumber) {
    const message = buildWhatsAppMessage(type, payload, appUrl);
    const result = await sendWhatsApp(user.phoneNumber, message);
    await supabase.from("NotificationLog").insert({
      userId: user.id,
      channel: "whatsapp",
      type,
      status: result.success ? "sent" : "failed",
      error: result.error ?? null,
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
  payload: NotificationPayload
): Promise<void> {
  const supabase = getSupabaseAdmin();
  let { data: members = [] } = await supabase
    .from("OrganisationMember")
    .select("*, User(*)")
    .eq("organisationId", organisationId)
    .neq("role", "VIEWER");

  if (!members?.length) {
    const alt = await supabase
      .from("OrganisationMember")
      .select("*, User(*)")
      .eq("organisation_id", organisationId)
      .neq("role", "VIEWER");
    members = alt.data ?? [];
  }

  const list = Array.isArray(members) ? members : [];
  const withUser = list
    .map((m: Record<string, unknown>) => toNotifyUser((m.User ?? m.user) as Record<string, unknown> | null))
    .filter((u): u is NotifyUser => u != null);

  await Promise.allSettled(
    withUser.map((u) => notifyUser(u, type, payload))
  );
}
