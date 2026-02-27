import { sendEmail } from "./email";
import { sendWhatsApp } from "./whatsapp";
import { prisma } from "./prisma";
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
}

export async function notifyUser(
  user: NotifyUser,
  type: NotificationType,
  payload: NotificationPayload
): Promise<void> {
  const appUrl = payload.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://grantpilot.co.uk";

  if (user.email) {
    const { subject, html } = buildEmailHtml(type, payload, appUrl);
    const result = await sendEmail(user.email, subject, html);
    await prisma.notificationLog.create({
      data: {
        userId: user.id,
        channel: "email",
        type,
        status: result.success ? "sent" : "failed",
        error: result.error ?? null,
      },
    });
  }

  if (user.whatsappOptIn && user.phoneNumber) {
    const message = buildWhatsAppMessage(type, payload, appUrl);
    const result = await sendWhatsApp(user.phoneNumber, message);
    await prisma.notificationLog.create({
      data: {
        userId: user.id,
        channel: "whatsapp",
        type,
        status: result.success ? "sent" : "failed",
        error: result.error ?? null,
      },
    });
  }
}

/**
 * Notify all members of an organisation (excluding viewers).
 */
export async function notifyOrgMembers(
  organisationId: string,
  type: NotificationType,
  payload: NotificationPayload
): Promise<void> {
  const members = await prisma.organisationMember.findMany({
    where: {
      organisationId,
      role: { not: "VIEWER" },
    },
    include: { user: true },
  });

  await Promise.allSettled(
    members.map((m) => notifyUser(m.user, type, payload))
  );
}
