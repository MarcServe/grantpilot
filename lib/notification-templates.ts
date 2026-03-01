import type { NotificationType, NotificationPayload } from "./notify";

function baseLayout(title: string, body: string, ctaUrl?: string, ctaText?: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f8fafc">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">
    <div style="text-align:center;margin-bottom:32px">
      <h2 style="color:#1B3A6B;margin:0">GrantPilot</h2>
    </div>
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
      <h1 style="font-size:20px;color:#1a1a1a;margin:0 0 16px">${title}</h1>
      <div style="color:#555;font-size:15px;line-height:1.6">${body}</div>
      ${ctaUrl ? `<div style="text-align:center;margin:24px 0">
        <a href="${ctaUrl}" style="display:inline-block;background:#1B3A6B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">${ctaText ?? "View in GrantPilot"}</a>
      </div>` : ""}
    </div>
    <div style="text-align:center;margin-top:24px;color:#999;font-size:12px">
      <p>&copy; ${new Date().getFullYear()} Biz Boosters Ltd. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

export function buildEmailHtml(
  type: NotificationType,
  payload: NotificationPayload,
  appUrl: string
): { subject: string; html: string } {
  const grant = payload.grantName ?? "your grant";

  switch (type) {
    case "welcome":
      return {
        subject: "Welcome to GrantPilot",
        html: baseLayout(
          "Welcome to GrantPilot",
          "<p>Thanks for joining GrantPilot. Start by completing your business profile — it takes about 5 minutes and unlocks AI grant matching.</p>",
          `${appUrl}/profile`,
          "Complete Your Profile"
        ),
      };

    case "application_started":
      return {
        subject: `Application started: ${grant}`,
        html: baseLayout(
          "Your application has started",
          `<p>We've started processing your application for <strong>${grant}</strong>.</p><p>Our AI is filling in the form using your business profile. We'll let you know when it's ready for review.</p>`,
          payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : undefined,
          "Track Progress"
        ),
      };

    case "review_required": {
      const reviewUrl = payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : undefined;
      const approveUrl = payload.approveToken
        ? `${appUrl}/approve?token=${encodeURIComponent(payload.approveToken)}`
        : undefined;
      const ctaUrl = reviewUrl;
      const extra = approveUrl
        ? `<p style="margin-top:16px"><a href="${approveUrl}" style="color:#1B3A6B;font-weight:600">Approve &amp; submit from this link</a> (no login needed on your phone)</p>`
        : "";
      return {
        subject: `Review required: ${grant}`,
        html: baseLayout(
          "Your application is ready for review",
          `<p>Your application for <strong>${grant}</strong> has been filled in by our AI and is ready for your review.</p><p>Please review all the information carefully before approving the submission.</p>${extra}`,
          ctaUrl,
          "Review Application"
        ),
      };
    }

    case "application_submitted":
      return {
        subject: `Application submitted: ${grant}`,
        html: baseLayout(
          "Application submitted successfully",
          `<p>Your application for <strong>${grant}</strong> has been submitted.</p><p>You'll receive any updates from the grant provider directly.</p>`,
          payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : undefined,
          "View Application"
        ),
      };

    case "application_failed":
      return {
        subject: `Application issue: ${grant}`,
        html: baseLayout(
          "There was an issue with your application",
          `<p>We encountered an issue while processing your application for <strong>${grant}</strong>.</p><p>Our team has been notified. You can check the status or try again from your dashboard.</p>`,
          payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : undefined,
          "View Details"
        ),
      };

    case "deadline_reminder":
      return {
        subject: `Grant deadline approaching: ${grant}`,
        html: baseLayout(
          "Grant deadline approaching",
          `<p>The deadline for <strong>${grant}</strong> is ${payload.deadline ?? "approaching soon"}.</p><p>Don't miss out — start your application now.</p>`,
          `${appUrl}/grants`,
          "View Grant"
        ),
      };

    case "grant_match":
      return {
        subject: "New grant matches found",
        html: baseLayout(
          "New grants match your profile",
          "<p>We've found new grants that match your business profile. Check them out and apply with AI.</p>",
          `${appUrl}/grants`,
          "View Matches"
        ),
      };

    case "grant_match_high": {
      const grantName = payload.grantName ?? "A grant";
      const score = payload.score ?? 85;
      const grantUrl = payload.grantId ? `${appUrl}/grants/${payload.grantId}` : `${appUrl}/grants`;
      return {
        subject: `You're ${score}% eligible: ${grantName}`,
        html: baseLayout(
          `High match: ${grantName}`,
          `<p>You're <strong>${score}% eligible</strong> for <strong>${grantName}</strong> based on your profile.</p><p>View the grant and apply with AI when you're ready.</p>`,
          grantUrl,
          "View Grant"
        ),
      };
    }

    default:
      return {
        subject: "Update from GrantPilot",
        html: baseLayout("Update", "<p>You have an update on GrantPilot.</p>", appUrl),
      };
  }
}

export function buildWhatsAppMessage(
  type: NotificationType,
  payload: NotificationPayload,
  appUrl: string
): string {
  const grant = payload.grantName ?? "your grant";

  switch (type) {
    case "application_started":
      return `Your application for ${grant} has started processing. We'll let you know when it's ready for review.\n\n${appUrl}/applications/${payload.applicationId ?? ""}`;

    case "review_required": {
      const reviewLink = payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : appUrl;
      const approveLink = payload.approveToken
        ? `${appUrl}/approve?token=${encodeURIComponent(payload.approveToken)}`
        : null;
      let msg = `Your application for ${grant} is ready for review.\n\n📋 Review: ${reviewLink}`;
      if (approveLink) msg += `\n✅ Approve (one tap): ${approveLink}`;
      return msg;
    }

    case "application_submitted":
      return `Your application for ${grant} has been submitted successfully.\n\n${appUrl}/applications/${payload.applicationId ?? ""}`;

    case "application_failed":
      return `There was an issue with your ${grant} application. Please check the details.\n\n${appUrl}/applications/${payload.applicationId ?? ""}`;

    case "deadline_reminder":
      return `Reminder: The deadline for ${grant} is ${payload.deadline ?? "approaching soon"}. Don't miss out!\n\n${appUrl}/grants`;

    case "grant_match_high": {
      const score = payload.score ?? 85;
      const grantUrl = payload.grantId ? `${appUrl}/grants/${payload.grantId}` : appUrl;
      return `You're ${score}% eligible for ${grant}. View grant and apply with AI:\n\n${grantUrl}`;
    }

    default:
      return `You have an update on GrantPilot.\n\n${appUrl}`;
  }
}
