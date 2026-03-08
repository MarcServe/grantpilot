import type { NotificationType, NotificationPayload, DigestGrantItem } from "./notify";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

    case "deadline_reminder": {
      const viewGrantUrl = payload.grantId ? `${appUrl}/grants/${payload.grantId}` : `${appUrl}/grants`;
      const startUrl = payload.startApplicationToken
        ? `${appUrl}/start-application?token=${encodeURIComponent(payload.startApplicationToken)}`
        : null;
      const startLink = startUrl
        ? `<p style="margin-top:12px"><a href="${startUrl}" style="color:#1B3A6B;font-weight:600">Start application from this link</a> (no login needed)</p>`
        : "";
      return {
        subject: `Grant deadline approaching: ${grant}`,
        html: baseLayout(
          "Grant deadline approaching",
          `<p>The deadline for <strong>${grant}</strong> is ${payload.deadline ?? "approaching soon"}.</p><p>Don't miss out — start your application now.</p>${startLink}`,
          viewGrantUrl,
          "View Grant"
        ),
      };
    }

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

    case "grant_scan_digest": {
      const profileName = payload.profileName ?? "Your business";
      const grants = payload.grants ?? [];
      const rows = grants
        .map((g: DigestGrantItem) => {
          const viewUrl = `${appUrl}/grants/${g.grantId}`;
          const startUrl = g.startApplicationToken
            ? `${appUrl}/start-application?token=${encodeURIComponent(g.startApplicationToken)}`
            : null;
          const summaryText = g.summary ? ` — ${g.summary.slice(0, 120)}${g.summary.length > 120 ? "…" : ""}` : "";
          const startLink = startUrl
            ? ` <a href="${startUrl}" style="color:#1B3A6B;font-weight:600">Start application</a>`
            : "";
          const missingNote =
            (g.missingDocuments?.length ?? 0) > 0
              ? `<br><span style="color:#b45309;font-size:13px">May require: ${escapeHtml((g.missingDocuments ?? []).join(", "))}. <a href="${appUrl}/profile" style="color:#1B3A6B">Add in Profile → Documents</a></span>`
              : "";
          return `<tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0"><strong>${escapeHtml(g.grantName)}</strong> (${g.score}% match)${escapeHtml(summaryText)}<br><a href="${viewUrl}" style="color:#1B3A6B">View grant</a>${startLink}${missingNote}</td></tr>`;
        })
        .join("");
      const table = rows ? `<table style="width:100%;border-collapse:collapse">${rows}</table>` : "";
      const hasAnyMissing = grants.some((g: DigestGrantItem) => ((g.missingDocuments?.length) ?? 0) > 0);
      const missingReminder = hasAnyMissing
        ? `<p style="margin-top:16px;padding:12px;background:#fef3c7;border-radius:8px;color:#92400e">Some grants may require documents you haven&apos;t uploaded yet. Add them in <a href="${appUrl}/profile" style="color:#1B3A6B;font-weight:600">Profile → Documents</a> so we can auto-attach them when you apply.</p>`
        : "";
      const body = `<p>New grant opportunities for <strong>${escapeHtml(profileName)}</strong> — review and start an application from the links below.</p>${table}${missingReminder}<p style="margin-top:16px">You can also browse all grants and apply with AI from the app.</p>`;
      return {
        subject: `[Grant Pilot] New grant opportunities for ${profileName}`,
        html: baseLayout(
          `New grant opportunities for ${escapeHtml(profileName)}`,
          body,
          `${appUrl}/grants`,
          "View all in Grant Pilot"
        ),
      };
    }

    case "subscription_activated": {
      const plan = payload.planName ?? "Pro";
      return {
        subject: `Welcome to GrantPilot ${plan}!`,
        html: baseLayout(
          `You're now on GrantPilot ${plan}`,
          `<p>Your subscription to <strong>GrantPilot ${plan}</strong> is now active.</p>
          <p>Here's what's unlocked:</p>
          <ul style="padding-left:20px">
            ${plan === "Business" ? "<li>5 business profiles</li><li>Unlimited grant matches</li><li>Unlimited auto-fills</li><li>Priority support</li><li>All notification channels</li>" : "<li>Unlimited grant matches</li><li>10 auto-fills per month</li><li>Email &amp; WhatsApp notifications</li>"}
          </ul>
          <p>Your AI grant matching is running daily — we'll send you matched grants every morning.</p>`,
          `${appUrl}/dashboard`,
          "Go to Dashboard"
        ),
      };
    }

    case "subscription_upgraded": {
      const plan = payload.planName ?? "Business";
      return {
        subject: `Upgraded to GrantPilot ${plan}`,
        html: baseLayout(
          `You've upgraded to GrantPilot ${plan}`,
          `<p>Your plan has been upgraded to <strong>GrantPilot ${plan}</strong>.</p>
          <p>Your new limits are now active — enjoy unlimited grant matches and auto-fills.</p>`,
          `${appUrl}/billing`,
          "View Subscription"
        ),
      };
    }

    case "subscription_cancelled":
      return {
        subject: "Your GrantPilot subscription has ended",
        html: baseLayout(
          "Your subscription has ended",
          `<p>Your GrantPilot paid subscription has been cancelled and your account has been moved to the Free Trial plan.</p>
          <p>You can still access your dashboard and existing applications, but AI grant matching, auto-fills, and notifications are limited on the free plan.</p>
          <p>Ready to come back? Upgrade anytime from the billing page.</p>`,
          `${appUrl}/billing`,
          "Resubscribe"
        ),
      };

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

    case "deadline_reminder": {
      const viewUrl = payload.grantId ? `${appUrl}/grants/${payload.grantId}` : appUrl + "/grants";
      let msg = `Reminder: The deadline for ${grant} is ${payload.deadline ?? "approaching soon"}. Don't miss out!\n\nView grant: ${viewUrl}`;
      if (payload.startApplicationToken)
        msg += `\nStart application: ${appUrl}/start-application?token=${encodeURIComponent(payload.startApplicationToken)}`;
      return msg;
    }

    case "grant_match_high": {
      const score = payload.score ?? 85;
      const grantUrl = payload.grantId ? `${appUrl}/grants/${payload.grantId}` : appUrl;
      return `You're ${score}% eligible for ${grant}. View grant and apply with AI:\n\n${grantUrl}`;
    }

    case "grant_scan_digest": {
      const profileName = payload.profileName ?? "Your business";
      const grants = payload.grants ?? [];
      let msg = `New grant opportunities for ${profileName}\n\n`;
      let anyMissing = false;
      for (const g of grants as DigestGrantItem[]) {
        const viewUrl = `${appUrl}/grants/${g.grantId}`;
        msg += `• ${g.grantName} (${g.score}% match)\n  View: ${viewUrl}\n`;
        if (g.startApplicationToken)
          msg += `  Start application: ${appUrl}/start-application?token=${encodeURIComponent(g.startApplicationToken)}\n`;
        if ((g.missingDocuments?.length ?? 0) > 0) anyMissing = true;
      }
      msg += `\nView all: ${appUrl}/grants`;
      if (anyMissing) msg += `\n\nSome grants may require documents you haven't uploaded. Add them in Profile → Documents: ${appUrl}/profile`;
      return msg;
    }

    case "subscription_activated": {
      const plan = payload.planName ?? "Pro";
      return `🎉 Welcome to GrantPilot ${plan}!\n\nYour subscription is active. AI grant matching runs daily — we'll send you matched grants every morning.\n\n${appUrl}/dashboard`;
    }

    case "subscription_upgraded": {
      const plan = payload.planName ?? "Business";
      return `⬆️ Upgraded to GrantPilot ${plan}!\n\nYour new limits are active. Enjoy unlimited grant matches and auto-fills.\n\n${appUrl}/billing`;
    }

    case "subscription_cancelled":
      return `Your GrantPilot subscription has ended. You're now on the Free Trial plan.\n\nResubscribe anytime: ${appUrl}/billing`;

    default:
      return `You have an update on GrantPilot.\n\n${appUrl}`;
  }
}
