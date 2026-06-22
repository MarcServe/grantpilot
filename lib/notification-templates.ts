import type { NotificationType, NotificationPayload, DigestGrantItem } from "./notify";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

function digestItemTime(item: DigestGrantItem): number {
  const raw = item.grantAddedAt ?? item.scoredAt;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function dedupeDigestItems(items: DigestGrantItem[]): DigestGrantItem[] {
  const seen = new Set<string>();
  const unique: DigestGrantItem[] = [];
  for (const item of items) {
    if (!item.grantId || seen.has(item.grantId)) continue;
    seen.add(item.grantId);
    unique.push(item);
  }
  return unique;
}

function sortDigestItemsByFreshness(a: DigestGrantItem, b: DigestGrantItem): number {
  const timeDelta = digestItemTime(b) - digestItemTime(a);
  if (timeDelta !== 0) return timeDelta;
  if (b.score !== a.score) return b.score - a.score;
  return a.grantName.localeCompare(b.grantName);
}

function subscriptionActivatedFeatureList(planName: string): string {
  if (planName === "Business") {
    return "<li>Up to 5 business profiles</li><li>Unlimited full eligibility &amp; DNA scoring</li><li>Unlimited application prep runs</li><li>Company DNA, grant auto-improve &amp; Founder Pack</li><li>Priority support &amp; notifications</li>";
  }
  if (planName === "Growth") {
    return "<li>1 business profile</li><li>Unlimited full eligibility &amp; DNA scoring</li><li>10 application prep runs/month</li><li>Company DNA, grant auto-improve &amp; Founder Pack</li><li>Email &amp; WhatsApp notifications</li>";
  }
  return "<li>Up to 2 business profiles</li><li>Unlimited full eligibility &amp; DNA scoring</li><li>25 application prep runs/month</li><li>Company DNA, grant auto-improve &amp; Founder Pack</li><li>Email &amp; WhatsApp notifications</li>";
}

function baseLayout(title: string, body: string, ctaUrl?: string, ctaText?: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f8fafc">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">
    <div style="text-align:center;margin-bottom:32px">
      <h2 style="color:#1B3A6B;margin:0">Grants-Copilot</h2>
    </div>
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
      <h1 style="font-size:20px;color:#1a1a1a;margin:0 0 16px">${title}</h1>
      <div style="color:#555;font-size:15px;line-height:1.6">${body}</div>
      ${ctaUrl ? `<div style="text-align:center;margin:24px 0">
        <a href="${ctaUrl}" style="display:inline-block;background:#1B3A6B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">${ctaText ?? "View in Grants-Copilot"}</a>
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
        subject: "Welcome to Grants-Copilot",
        html: baseLayout(
          "Welcome to Grants-Copilot",
          "<p>Thanks for joining Grants-Copilot. Start by completing your business profile — it takes about 5 minutes and unlocks GrantsCopilot grant matching.</p>",
          `${appUrl}/profile`,
          "Complete Your Profile"
        ),
      };

    case "application_started":
      return {
        subject: `Application prep added: ${grant}`,
        html: baseLayout(
          "Your application prep workspace is ready",
          `<p>We added <strong>${grant}</strong> to your application workspace.</p><p>Review eligibility, generate your preparation documents, open the official funder form, then mark the application submitted after you send it.</p>`,
          payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : undefined,
          "Open application"
        ),
      };

    case "review_required": {
      const reviewUrl = payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : undefined;
      const approveUrl = payload.approveToken
        ? `${appUrl}/approve?token=${encodeURIComponent(payload.approveToken)}`
        : undefined;
      const ctaUrl = reviewUrl;
      const extra = approveUrl
        ? `<p style="margin-top:16px"><a href="${approveUrl}" style="color:#1B3A6B;font-weight:600">Open review link</a></p>`
        : "";
      return {
        subject: `Review required: ${grant}`,
        html: baseLayout(
          "Your application needs review",
          `<p>Your application workspace for <strong>${grant}</strong> is ready for review.</p><p>Check your prepared answers and documents, then submit on the official funder site when ready.</p>${extra}`,
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
          `<p>Your application for <strong>${grant}</strong> has been submitted.</p><p>You&apos;ll receive any updates from the grant provider directly.</p><p style="margin-top:14px">When you hear back, open your application and record the outcome — awarded, rejected, shortlisted, or withdrawn — so GrantsCopilot can sharpen future matches.</p>`,
          payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : undefined,
          "View application"
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

    case "application_login_required": {
      const applicationUrl = payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : appUrl;
      return {
        subject: `Sign-in required: ${grant}`,
        html: baseLayout(
          "Sign in required to continue",
          `<p>Your application for <strong>${grant}</strong> needs you to sign in on the funder's website.</p><p>Open the application below, sign in or create an account on the funder site, then use your prepared answers and documents to complete the form.</p>`,
          applicationUrl,
          "Open Application"
        ),
      };
    }

    case "application_needs_info": {
      const applicationUrl = payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : appUrl;
      const labels = (payload.needsInputLabels ?? [])
        .filter((label) => typeof label === "string" && label.trim().length > 0)
        .slice(0, 5);
      const detailsList = labels.length > 0
        ? `<ul style="padding-left:20px">${labels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul>`
        : "";
      return {
        subject: `More info needed: ${grant}`,
        html: baseLayout(
          "We need a few details to continue",
          `<p>Your application for <strong>${grant}</strong> needs a few required details that aren't in your profile.</p>${detailsList}<p>Open the application below, add the missing details, and keep them with your preparation materials before you submit on the funder site.</p>`,
          applicationUrl,
          "Provide Details"
        ),
      };
    }

    case "deadline_reminder": {
      const viewGrantUrl = payload.grantId ? `${appUrl}/grants/${payload.grantId}` : `${appUrl}/grants`;
      return {
        subject: `Grant deadline approaching: ${grant}`,
        html: baseLayout(
          "Grant deadline approaching",
          `<p>The deadline for <strong>${grant}</strong> is ${payload.deadline ?? "approaching soon"}.</p><p>Don't miss out — review the fit, prepare your documents, and apply on the official funder site.</p>`,
          viewGrantUrl,
          "View Grant"
        ),
      };
    }

    case "daily_grant_update": {
      const profileName = payload.profileName ?? "your business";
      const checked = payload.checkedGrantsCount ?? 0;
      const matched = Math.max(0, Math.round(Number(payload.matchedGrantsCount ?? 0)));
      const matchedLine =
        matched > 0
          ? `<p>You currently have <strong>${matched}</strong> 85%+ suggested ${matched === 1 ? "grant" : "grants"} available in My Matches.</p>`
          : "<p>No new 85%+ suggested grants were ready to notify you about this morning. Check My Matches for within-reach opportunities.</p>";
      return {
        subject: "Today's GrantsCopilot scan is complete",
        html: baseLayout(
          "Today's grant scan is complete",
          `<p>GrantsCopilot checked fresh opportunities for <strong>${escapeHtml(profileName)}</strong>.</p>
          ${matchedLine}
          <p>We&apos;ll keep scanning daily and send WhatsApp only when there is a strong opportunity alert.</p>
          ${checked > 0 ? `<p style="color:#64748b;font-size:13px">Checked ${checked} available grants.</p>` : ""}`,
          `${appUrl}/grants/eligible`,
          "View My Matches"
        ),
      };
    }

    case "deadline_daily_update":
      return {
        subject: "Today's grant deadline check is complete",
        html: baseLayout(
          "No urgent grant deadlines today",
          "<p>GrantsCopilot checked your eligible and saved opportunities for upcoming deadline reminders.</p><p>There are no deadline reminders due this morning. We'll email you when an eligible grant is 7, 3, or 1 day from closing, or due today.</p>",
          `${appUrl}/grants/eligible`,
          "View My Matches"
        ),
      };

    case "eligibility_upgrade_prompt": {
      const count = Math.max(0, Math.round(Number(payload.matchedGrantsCount ?? 0)));
      const noun = count === 1 ? "grant" : "grants";
      return {
        subject:
          count > 0
            ? `${count} eligible ${noun} waiting in GrantsCopilot`
            : "Eligible grants are waiting in GrantsCopilot",
        html: baseLayout(
          count > 0 ? `${count} eligible ${noun} waiting` : "Eligible grants are waiting",
          `<p>GrantsCopilot found <strong>${count || "new"}</strong> strong-fit grant ${count === 1 ? "opportunity" : "opportunities"} for your business.</p>
          <p>Choose a plan to unlock daily opportunity alerts, full eligibility reasoning, and automatic application preparation.</p>
          <p>You can still browse your account, but auto-prep and proactive notifications require an active plan.</p>`,
          `${appUrl}/billing`,
          "Choose a plan"
        ),
      };
    }

    case "business_dna_match_health": {
      const profileName = payload.profileName ?? "your business";
      const withinReach = Math.max(0, Math.round(Number(payload.withinReachCount ?? payload.matchedGrantsCount ?? 0)));
      const days = Math.max(3, Math.round(Number(payload.daysWithoutHighMatch ?? 3)));
      const blockers = (payload.matchHealthBlockers ?? []).filter(Boolean).slice(0, 5);
      const actions = (payload.matchHealthActions ?? []).filter(Boolean).slice(0, 5);
      const blockersHtml = blockers.length
        ? `<p><strong>What is holding matches back:</strong></p><ul style="padding-left:20px">${blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : "";
      const actionsHtml = actions.length
        ? `<p><strong>What to improve:</strong></p><ul style="padding-left:20px">${actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : "";
      return {
        subject: "Improve your Business DNA to unlock stronger grant matches",
        html: baseLayout(
          "No new high-confidence matches yet",
          `<p>GrantsCopilot has not found a new 85%+ actionable match for <strong>${escapeHtml(profileName)}</strong> in about ${days} days.</p>
          <p>We did find <strong>${withinReach}</strong> within-reach ${withinReach === 1 ? "grant" : "grants"}, but your Business DNA may need stronger evidence or broader factual positioning before we can recommend them with high confidence.</p>
          ${blockersHtml}
          ${actionsHtml}
          <p>Open My Matches and use <strong>Improve Business DNA</strong> to review AI-suggested edits before applying them.</p>`,
          `${appUrl}/grants/eligible`,
          "Review Business DNA"
        ),
      };
    }

    case "grant_match":
      return {
        subject: "New grant matches found",
        html: baseLayout(
          "New grants match your profile",
          "<p>We've found new grants that match your business profile. Check them out and apply with GrantsCopilot.</p>",
          `${appUrl}/grants`,
          "View Matches"
        ),
      };

    case "grant_match_high": {
      const grantName = payload.grantName ?? "A grant";
      const score = payload.score ?? 85;
      const ctaUrl = payload.grantId ? `${appUrl}/grants/${payload.grantId}` : `${appUrl}/grants`;
      return {
        subject: `You're ${score}% eligible: ${grantName}`,
        html: baseLayout(
          `High match: ${grantName}`,
          `<p>You're <strong>${score}% eligible</strong> for <strong>${grantName}</strong> based on your profile.</p><p>Review the grant, prepare your answers, and apply on the official funder site.</p>`,
          ctaUrl,
          "View Grant"
        ),
      };
    }

    case "grant_scan_digest": {
      const profileName = payload.profileName ?? "Your business";
      const grants = payload.grants ?? [];
      const withinReachGrants = payload.withinReachGrants ?? [];
      const previousScanGrants = payload.previousScanGrants ?? [];
      const renderRows = (items: DigestGrantItem[], tone: "strong" | "withinReach" | "previous") => {
        const palette =
          tone === "strong"
            ? {
                background: "#f0f7ff",
                border: "#bfdbfe",
                accent: "#2563eb",
                title: "#1e3a8a",
                badgeBackground: "#dbeafe",
                badgeText: "#1e40af",
                workText: "#0369a1",
              }
            : tone === "withinReach"
              ? {
                  background: "#fffbeb",
                  border: "#fde68a",
                  accent: "#d97706",
                  title: "#92400e",
                  badgeBackground: "#fef3c7",
                  badgeText: "#92400e",
                  workText: "#b45309",
                }
              : {
                  background: "#f8fafc",
                  border: "#cbd5e1",
                  accent: "#64748b",
                  title: "#334155",
                  badgeBackground: "#e2e8f0",
                  badgeText: "#334155",
                  workText: "#475569",
                };
        return items
          .map((g: DigestGrantItem) => {
            const viewUrl = `${appUrl}/grants/${g.grantId}`;
            const summaryText = g.summary ? ` — ${g.summary.slice(0, 120)}${g.summary.length > 120 ? "…" : ""}` : "";
            const missingNote =
              (g.missingDocuments?.length ?? 0) > 0
                ? `<br><span style="color:#b45309;font-size:13px">May require: ${escapeHtml((g.missingDocuments ?? []).join(", "))}. <a href="${appUrl}/profile" style="color:#1B3A6B">Add in Profile → Documents</a></span>`
                : "";
            const hasWorkNeeded =
              g.score < 80 &&
              ((g.improvementPlan?.actions?.length ?? 0) > 0 ||
                (g.improvementPlan?.gaps?.length ?? 0) > 0 ||
                (g.missingCriteria?.length ?? 0) > 0);
            const workNeededParts: string[] = [];
            if (g.improvementPlan?.actions?.length) workNeededParts.push(...g.improvementPlan.actions.slice(0, 3));
            if (g.improvementPlan?.gaps?.length) workNeededParts.push(...g.improvementPlan.gaps.slice(0, 2));
            if (g.missingCriteria?.length) workNeededParts.push(...g.missingCriteria.slice(0, 3));
            const workNeededNote =
              hasWorkNeeded && workNeededParts.length > 0
                ? `<br><span style="color:${palette.workText};font-size:13px">Work needed to improve fit: ${escapeHtml([...new Set(workNeededParts)].slice(0, 3).join("; "))}. <a href="${viewUrl}" style="color:#1B3A6B">View grant for full details</a></span>`
                : "";
            return `<tr><td style="padding:14px 16px;border:1px solid ${palette.border};border-left:4px solid ${palette.accent};border-radius:10px;background:${palette.background}"><strong style="color:${palette.title};font-weight:700">${escapeHtml(g.grantName)}</strong> <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:${palette.badgeBackground};color:${palette.badgeText};font-size:12px;font-weight:700">${g.score}% match</span>${escapeHtml(summaryText)}<br><a href="${viewUrl}" style="color:#1B3A6B;font-weight:600">View grant and prepare</a>${missingNote}${workNeededNote}</td></tr>`;
          })
          .join("");
      };
      const strongRows = renderRows(grants, "strong");
      const withinReachRows = renderRows(withinReachGrants, "withinReach");
      const previousRows = renderRows(previousScanGrants.slice(0, 3), "previous");
      const strongSection = strongRows
        ? `<h2 style="font-size:16px;color:#1e3a8a;margin:20px 0 4px;font-weight:700">Strong matches</h2><table style="width:100%;border-collapse:separate;border-spacing:0 10px">${strongRows}</table>`
        : "";
      const withinReachSection = withinReachRows
        ? `<h2 style="font-size:16px;color:#92400e;margin:20px 0 4px;font-weight:700">Within reach</h2><p style="margin:0 0 8px;color:#64748b;font-size:13px">These may be worth reviewing, but check the listed gaps before applying.</p><table style="width:100%;border-collapse:separate;border-spacing:0 10px">${withinReachRows}</table>`
        : "";
      const previousSection = previousRows
        ? `<h2 style="font-size:15px;color:#334155;margin:20px 0 4px;font-weight:700">Still available from previous scans</h2><p style="margin:0 0 8px;color:#64748b;font-size:13px">You may have seen these recently. They are still current if you missed them.</p><table style="width:100%;border-collapse:separate;border-spacing:0 8px">${previousRows}</table>`
        : "";
      const hasAnyMissing = [...grants, ...withinReachGrants, ...previousScanGrants].some((g: DigestGrantItem) => ((g.missingDocuments?.length) ?? 0) > 0);
      const missingReminder = hasAnyMissing
        ? `<p style="margin-top:16px;padding:12px;background:#fef3c7;border-radius:8px;color:#92400e">Some grants may require documents you haven&apos;t uploaded yet. Add them in <a href="${appUrl}/profile" style="color:#1B3A6B;font-weight:600">Profile → Documents</a> before you apply.</p>`
        : "";
      const body = `<p>Today&apos;s grant opportunities for <strong>${escapeHtml(profileName)}</strong> — review the fit, prepare your documents, and apply on the official funder site.</p>${strongSection}${withinReachSection}${previousSection}${missingReminder}<p style="margin-top:16px">You can also browse all your matches from the app.</p>`;
      return {
        subject: `[Grants-Copilot] Today's grant opportunities for ${profileName}`,
        html: baseLayout(
          `Today's grant opportunities for ${escapeHtml(profileName)}`,
          body,
          `${appUrl}/grants/eligible`,
          "View all matches"
        ),
      };
    }

    case "subscription_activated": {
      const plan = payload.planName ?? "Pro";
      return {
        subject: `Welcome to Grants-Copilot ${plan}!`,
        html: baseLayout(
          `You're now on Grants-Copilot ${plan}`,
          `<p>Your subscription to <strong>Grants-Copilot ${plan}</strong> is now active.</p>
          <p>Here's what's unlocked:</p>
          <ul style="padding-left:20px">
            ${subscriptionActivatedFeatureList(plan)}
          </ul>
          <p>Your GrantsCopilot grant matching is running daily — we'll send you matched grants every morning.</p>`,
          `${appUrl}/dashboard`,
          "Go to Dashboard"
        ),
      };
    }

    case "subscription_upgraded": {
      const plan = payload.planName ?? "Business";
      return {
        subject: `Upgraded to Grants-Copilot ${plan}`,
        html: baseLayout(
          `You've upgraded to Grants-Copilot ${plan}`,
          `<p>Your plan has been upgraded to <strong>Grants-Copilot ${plan}</strong>.</p>
          <p>Your new limits are now active — see usage anytime on the billing page.</p>`,
          `${appUrl}/billing`,
          "View Subscription"
        ),
      };
    }

    case "subscription_cancelled":
      return {
        subject: "Your Grants-Copilot subscription has ended",
        html: baseLayout(
          "Your subscription has ended",
          `<p>Your Grants-Copilot paid subscription has been cancelled and your account has been moved to the Free Trial plan.</p>
          <p>You can still access your dashboard and existing applications, but GrantsCopilot grant matching, application prep, and notifications are limited on the free plan.</p>
          <p>Ready to come back? Upgrade anytime from the billing page.</p>`,
          `${appUrl}/billing`,
          "Resubscribe"
        ),
      };

    case "outcome_feedback_reminder": {
      const n = payload.pendingOutcomeCount ?? 0;
      const names = (payload.outcomeGrantNames ?? []).filter((x) => typeof x === "string" && x.trim().length > 0).slice(0, 5);
      const list =
        names.length > 0
          ? `<ul style="padding-left:20px;margin-top:12px">${names.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>`
          : "";
      const queueUrl = `${appUrl}/applications/outcomes`;
      return {
        subject:
          n === 1 ? "Record your grant outcome — GrantsCopilot" : `${n} applications waiting on outcome feedback`,
        html: baseLayout(
          n === 1 ? "One outcome still to record" : "Help GrantsCopilot learn from your results",
          `<p>You have <strong>${n}</strong> submitted application${n === 1 ? "" : "s"} without a final outcome recorded.</p>
          <p>When funders reply by email or portal, log the result here — we use it to tune eligibility and recommendations.</p>${list}
          <p style="margin-top:14px"><a href="${queueUrl}" style="color:#1B3A6B;font-weight:600">Open outcome queue</a></p>`,
          queueUrl,
          "Record outcomes"
        ),
      };
    }

    default:
      return {
        subject: "Update from Grants-Copilot",
        html: baseLayout("Update", "<p>You have an update on Grants-Copilot.</p>", appUrl),
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
      return `Your application prep workspace for ${grant} is ready. Review eligibility, generate prep documents, apply on the funder site, then mark it submitted.\n\n${appUrl}/applications/${payload.applicationId ?? ""}`;

    case "review_required": {
      const reviewLink = payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : appUrl;
      const approveLink = payload.approveToken
        ? `${appUrl}/approve?token=${encodeURIComponent(payload.approveToken)}`
        : null;
      let msg = `Your application workspace for ${grant} is ready for review.\n\nReview: ${reviewLink}`;
      if (approveLink) msg += `\nReview link: ${approveLink}`;
      return msg;
    }

    case "application_submitted":
      return `Your application for ${grant} has been submitted successfully.\n\nWhen you hear back from the funder, record the outcome in GrantsCopilot so we can improve future matches.\n\n${appUrl}/applications/${payload.applicationId ?? ""}`;

    case "application_failed":
      return `There was an issue with your ${grant} application. Please check the details.\n\n${appUrl}/applications/${payload.applicationId ?? ""}`;

    case "application_login_required": {
      const applicationUrl = payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : appUrl;
      return `Sign-in required for ${grant}. Sign in on the funder's site, then use your prepared answers and documents to complete the form.\n\nOpen application: ${applicationUrl}`;
    }

    case "application_needs_info": {
      const applicationUrl = payload.applicationId ? `${appUrl}/applications/${payload.applicationId}` : appUrl;
      const details = (payload.needsInputLabels ?? [])
        .filter((label) => typeof label === "string" && label.trim().length > 0)
        .slice(0, 3)
        .join("; ");
      const detailLine = details ? `\n\nNeeded: ${details}` : "";
      return `We need a few details for your ${grant} application.${detailLine}\n\nOpen the link and add the missing details to your preparation materials before submitting on the funder site.\n\n${applicationUrl}`;
    }

    case "deadline_reminder": {
      const viewUrl = payload.grantId ? `${appUrl}/grants/${payload.grantId}` : appUrl + "/grants";
      return `Reminder: The deadline for ${grant} is ${payload.deadline ?? "approaching soon"}. Review the fit and prepare your documents before applying.\n\nView grant: ${viewUrl}`;
    }

    case "daily_grant_update":
      return `Today's GrantsCopilot scan is complete. You currently have ${Math.max(0, Math.round(Number(payload.matchedGrantsCount ?? 0)))} 85%+ suggested grants available in My Matches. Check My Matches for within-reach opportunities too.\n\nView matches: ${appUrl}/grants/eligible`;

    case "deadline_daily_update":
      return `Today's deadline check is complete. There are no urgent eligible grant deadline reminders due this morning.\n\nView matches: ${appUrl}/grants/eligible`;

    case "eligibility_upgrade_prompt": {
      const count = Math.max(0, Math.round(Number(payload.matchedGrantsCount ?? 0)));
      const noun = count === 1 ? "grant" : "grants";
      return `GrantsCopilot found ${count || "new"} eligible ${noun} waiting for your business. Choose a plan to unlock automatic application preparation and daily opportunity alerts.\n\n${appUrl}/billing`;
    }

    case "business_dna_match_health": {
      const profileName = payload.profileName ?? "your business";
      const withinReach = Math.max(0, Math.round(Number(payload.withinReachCount ?? payload.matchedGrantsCount ?? 0)));
      return `No new 85%+ match for ${profileName} yet. GrantsCopilot found ${withinReach} within-reach grants, but your Business DNA may need stronger evidence or broader factual positioning.\n\nReview: ${appUrl}/grants/eligible`;
    }

    case "grant_match_high": {
      const score = payload.score ?? 85;
      const linkUrl = payload.grantId ? `${appUrl}/grants/${payload.grantId}` : appUrl;
      return `You're ${score}% eligible for ${grant}. Review the grant and prepare your application:\n\n${linkUrl}`;
    }

    case "grant_scan_digest": {
      const profileName = payload.profileName ?? "Your business";
      const grants = payload.grants ?? [];
      const withinReachGrants = payload.withinReachGrants ?? [];
      const previousScanGrants = payload.previousScanGrants ?? [];
      const now = Date.now();
      const todayCutoff = now - ONE_DAY_MS;
      const recentCutoff = now - SEVEN_DAYS_MS;
      const strongItems = dedupeDigestItems([
        ...(grants as DigestGrantItem[]),
        ...(previousScanGrants as DigestGrantItem[]).filter((g) => g.score >= 85),
      ]).sort(sortDigestItemsByFreshness);
      const todayStrong = strongItems.filter((item) => digestItemTime(item) >= todayCutoff);
      const recentStrong = strongItems.filter((item) => {
        const time = digestItemTime(item);
        return time < todayCutoff && time >= recentCutoff;
      });
      const olderStrong = strongItems.filter((item) => {
        const time = digestItemTime(item);
        return time === 0 || time < recentCutoff;
      });
      const compactName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, 88);
      const renderSection = (title: string, items: DigestGrantItem[], limit: number) => {
        if (items.length === 0) return "";
        const rows = items.slice(0, limit).map((g, index) => `${index + 1}. ${compactName(g.grantName)} (${g.score}% match)`);
        const extra = items.length > limit ? `\n+ ${items.length - limit} more in the app` : "";
        return `${title}\n${rows.join("\n")}${extra}\n\n`;
      };

      let msg = `Today's grant opportunities for ${profileName}\n\n`;
      const anyMissing = [...grants, ...withinReachGrants, ...previousScanGrants]
        .some((g) => ((g as DigestGrantItem).missingDocuments?.length ?? 0) > 0);
      msg += renderSection("Fresh strong matches today:", todayStrong, 8);
      msg += renderSection("Last 7 days still available:", recentStrong, 8);
      if (todayStrong.length === 0 && recentStrong.length === 0) {
        msg += renderSection("Strong matches still available:", olderStrong, 8);
      } else {
        msg += renderSection("Other strong matches still available:", olderStrong, 4);
      }
      const withinReach = dedupeDigestItems(withinReachGrants as DigestGrantItem[]).sort(sortDigestItemsByFreshness);
      msg += renderSection("Within reach:", withinReach, 4);
      if (strongItems.length === 0 && withinReach.length === 0) {
        msg += "No new strong WhatsApp matches were ready, but your opportunity page is up to date.\n\n";
      }
      msg += `View all and start applications: ${appUrl}/grants/eligible`;
      if (anyMissing) msg += `\n\nSome grants may require documents you haven't uploaded. Add them in Profile > Documents.`;
      return msg;
    }

    case "subscription_activated": {
      const plan = payload.planName ?? "Pro";
      return `🎉 Welcome to Grants-Copilot ${plan}!\n\nYour subscription is active. GrantsCopilot grant matching runs daily — we'll send you matched grants every morning.\n\n${appUrl}/dashboard`;
    }

    case "subscription_upgraded": {
      const plan = payload.planName ?? "Business";
      return `⬆️ Upgraded to Grants-Copilot ${plan}!\n\nYour new limits are active. View details: ${appUrl}/billing`;
    }

    case "subscription_cancelled":
      return `Your Grants-Copilot subscription has ended. You're now on the Free Trial plan.\n\nResubscribe anytime: ${appUrl}/billing`;

    case "outcome_feedback_reminder": {
      const n = payload.pendingOutcomeCount ?? 0;
      const queueUrl = `${appUrl}/applications/outcomes`;
      return `${n} submitted application${n === 1 ? "" : "s"} still need outcome feedback (award, rejection, shortlist, or withdrawal). Record them so GrantsCopilot can learn:\n\n${queueUrl}`;
    }

    default:
      return `You have an update on Grants-Copilot.\n\n${appUrl}`;
  }
}
