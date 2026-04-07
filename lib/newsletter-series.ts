import { getSupabaseAdmin } from "./supabase";
import { sendEmail } from "./email";

export type NewsletterTemplateKey = "magazine" | "minimal" | "bold" | "split";

export interface NewsletterGrantItem {
  id: string;
  name: string;
  funder: string;
  applicationUrl: string;
  deadline?: string | null;
  amount?: number | null;
  description?: string | null;
  sectors?: string[] | null;
  regions?: string[] | null;
  url_status?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAmount(amount?: number | null): string | null {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const n = Number(amount);
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${Math.round(n)}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function pickTemplateKey(issueDate: Date): NewsletterTemplateKey {
  const keys: NewsletterTemplateKey[] = ["magazine", "minimal", "bold", "split"];
  const day = Math.floor(issueDate.getTime() / 86_400_000);
  return keys[Math.abs(day) % keys.length]!;
}

function subjectFor(issueDate: Date, count: number): string {
  const dateStr = issueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `[Grants-Copilot] ${count} new funding opportunities — ${dateStr}`;
}

function textFallback(issueDate: Date, grants: NewsletterGrantItem[]): string {
  const lines: string[] = [];
  lines.push(`Grants-Copilot — Daily funding opportunities (${fmtDate(issueDate)})`);
  lines.push("");
  if (grants.length === 0) {
    lines.push("No new grants matched today.");
    return lines.join("\n");
  }
  for (const g of grants) {
    const amount = formatAmount(g.amount);
    const deadline = g.deadline ? new Date(g.deadline).toLocaleDateString("en-GB") : null;
    const meta = [amount ? `Amount: ${amount}` : null, deadline ? `Deadline: ${deadline}` : null].filter(Boolean).join(" · ");
    lines.push(`- ${g.name} — ${g.funder}`);
    if (meta) lines.push(`  ${meta}`);
    lines.push(`  Apply: ${g.applicationUrl}`);
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

function baseShell(title: string, preheader: string, body: string, accent: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#0b1220">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b1220;padding:24px 0">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="width:640px;max-width:640px">
          <tr>
            <td style="padding:0 16px 12px 16px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px">
              <span style="display:inline-block;padding:6px 10px;border:1px solid rgba(148,163,184,.25);border-radius:999px">Grants-Copilot</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0 16px">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(148,163,184,.18)">
                <tr>
                  <td style="padding:24px 24px 0 24px">
                    <h1 style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:22px;line-height:1.25;color:#0f172a">${escapeHtml(
                      title
                    )}</h1>
                    <div style="height:4px;width:64px;background:${accent};border-radius:999px"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 24px 24px 24px">${body}</td>
                </tr>
              </table>
              <div style="padding:14px 8px 0 8px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;text-align:center">
                <div>© ${new Date().getFullYear()} Biz Boosters Ltd.</div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderCardList(grants: NewsletterGrantItem[], opts: { accent: string; buttonBg: string; buttonText: string }): string {
  const cards = grants
    .map((g) => {
      const amount = formatAmount(g.amount);
      const deadline = g.deadline ? new Date(g.deadline).toLocaleDateString("en-GB") : null;
      const blurb = (g.description ?? "").trim().slice(0, 160);
      const metaParts = [
        amount ? `<span style="display:inline-block;padding:4px 8px;border-radius:999px;background:rgba(2,132,199,.10);color:#075985;border:1px solid rgba(2,132,199,.18)">${escapeHtml(amount)}</span>` : "",
        deadline
          ? `<span style="display:inline-block;padding:4px 8px;border-radius:999px;background:rgba(234,88,12,.10);color:#9a3412;border:1px solid rgba(234,88,12,.18)">Deadline ${escapeHtml(deadline)}</span>`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid rgba(15,23,42,.10);border-radius:14px;margin:0 0 14px 0">
  <tr><td style="padding:16px 16px 14px 16px">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;font-weight:700;color:#0f172a;margin:0 0 4px 0">${escapeHtml(
      g.name
    )}</div>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;color:#475569;margin:0 0 10px 0">${escapeHtml(
      g.funder
    )}</div>
    ${metaParts ? `<div style="margin:0 0 10px 0">${metaParts}</div>` : ""}
    ${blurb ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.55;color:#334155;margin:0 0 12px 0">${escapeHtml(blurb)}${(g.description ?? "").length > 160 ? "…" : ""}</div>` : ""}
    <a href="${escapeHtml(
      g.applicationUrl
    )}" style="display:inline-block;background:${opts.buttonBg};color:${opts.buttonText};text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;font-weight:700;padding:10px 14px;border-radius:10px">View &amp; apply</a>
  </td></tr>
</table>`;
    })
    .join("");
  return cards;
}

function renderTemplate(templateKey: NewsletterTemplateKey, issueDate: Date, grants: NewsletterGrantItem[]): { subject: string; html: string; text: string } {
  const count = grants.length;
  const subject = subjectFor(issueDate, count);
  const dateLine = `Daily brief · ${fmtDate(issueDate)}`;

  if (count === 0) {
    const html = baseShell(
      "Today’s funding brief",
      "No new grants today.",
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#334155;font-size:14px;line-height:1.6">
        <p style="margin:0 0 10px 0">${escapeHtml(dateLine)}</p>
        <p style="margin:0">No new grants were added today. We’ll be back tomorrow with fresh opportunities.</p>
      </div>`,
      "#22c55e"
    );
    return { subject, html, text: textFallback(issueDate, grants) };
  }

  if (templateKey === "minimal") {
    const body = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#334155;font-size:14px;line-height:1.6">
      <p style="margin:0 0 10px 0">${escapeHtml(dateLine)}</p>
      <p style="margin:0 0 14px 0">Here are today’s new funding opportunities (freshly discovered/updated):</p>
      ${renderCardList(grants, { accent: "#0ea5e9", buttonBg: "#0f172a", buttonText: "#ffffff" })}
      <p style="margin:14px 0 0 0;color:#64748b;font-size:12px">Tip: forward this email to a colleague and add them to the list.</p>
    </div>`;
    return {
      subject,
      html: baseShell("Today’s funding brief", `Today: ${count} new opportunities`, body, "#0ea5e9"),
      text: textFallback(issueDate, grants),
    };
  }

  if (templateKey === "bold") {
    const body = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a">
      <div style="padding:12px 14px;border-radius:14px;background:linear-gradient(135deg, rgba(168,85,247,.14), rgba(236,72,153,.10));border:1px solid rgba(168,85,247,.18);margin:0 0 14px 0">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b21a8;font-weight:700">${escapeHtml(
          dateLine
        )}</div>
        <div style="font-size:16px;font-weight:800;margin-top:6px">Today’s highlights: ${count} opportunities</div>
      </div>
      ${renderCardList(grants, { accent: "#a855f7", buttonBg: "#a855f7", buttonText: "#ffffff" })}
    </div>`;
    return {
      subject,
      html: baseShell("Today’s funding brief", `Today: ${count} new opportunities`, body, "#a855f7"),
      text: textFallback(issueDate, grants),
    };
  }

  if (templateKey === "split") {
    const top = grants.slice(0, 1);
    const rest = grants.slice(1);
    const hero = top[0]!;
    const amount = formatAmount(hero.amount);
    const deadline = hero.deadline ? new Date(hero.deadline).toLocaleDateString("en-GB") : null;
    const meta = [amount ? `Amount ${amount}` : null, deadline ? `Deadline ${deadline}` : null].filter(Boolean).join(" · ");
    const heroBody = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:16px;background:#0f172a;color:#fff;overflow:hidden;margin:0 0 14px 0">
      <tr><td style="padding:18px 18px 16px 18px">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;opacity:.85">${escapeHtml(
          dateLine
        )}</div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:18px;font-weight:900;margin:10px 0 6px 0">${escapeHtml(
          hero.name
        )}</div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;opacity:.9">${escapeHtml(
          hero.funder
        )}${meta ? ` · ${escapeHtml(meta)}` : ""}</div>
        <div style="height:12px"></div>
        <a href="${escapeHtml(
          hero.applicationUrl
        )}" style="display:inline-block;background:#22c55e;color:#052e16;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;font-weight:900;padding:10px 14px;border-radius:10px">View &amp; apply</a>
      </td></tr>
    </table>`;
    const body = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#334155;font-size:14px;line-height:1.6">
      ${heroBody}
      ${rest.length ? `<div style="font-size:13px;color:#64748b;margin:0 0 10px 0">More opportunities</div>` : ""}
      ${rest.length ? renderCardList(rest, { accent: "#22c55e", buttonBg: "#0f172a", buttonText: "#ffffff" }) : ""}
    </div>`;
    return {
      subject,
      html: baseShell("Today’s funding brief", `Today: ${count} new opportunities`, body, "#22c55e"),
      text: textFallback(issueDate, grants),
    };
  }

  // magazine (default)
  const body = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#334155;font-size:14px;line-height:1.6">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:14px;background:linear-gradient(135deg, rgba(14,165,233,.14), rgba(34,197,94,.10));border:1px solid rgba(14,165,233,.18);margin:0 0 14px 0">
      <tr><td style="padding:14px 14px 12px 14px">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0369a1;font-weight:800">Daily brief</div>
        <div style="margin-top:6px;font-size:14px;color:#0f172a;font-weight:700">${escapeHtml(dateLine)} · ${count} opportunities</div>
      </td></tr>
    </table>
    ${renderCardList(grants, { accent: "#0ea5e9", buttonBg: "#0ea5e9", buttonText: "#ffffff" })}
  </div>`;

  return {
    subject,
    html: baseShell("Today’s funding brief", `Today: ${count} new opportunities`, body, "#0ea5e9"),
    text: textFallback(issueDate, grants),
  };
}

function parseRecipientOverride(): string[] | null {
  const raw = (process.env.NEWSLETTER_RECIPIENTS ?? "").trim();
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

function isEnabled(): boolean {
  const raw = (process.env.NEWSLETTER_ENABLED ?? "").trim().toLowerCase();
  if (!raw) return false;
  return ["1", "true", "yes", "on", "enabled"].includes(raw);
}

function isDryRun(): boolean {
  const raw = (process.env.NEWSLETTER_DRY_RUN ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

function dayKey(issueDate: Date): string {
  return issueDate.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function generateAndSendDailyNewsletter(options?: {
  issueDate?: Date;
  maxGrants?: number;
}): Promise<{
  enabled: boolean;
  dryRun: boolean;
  templateKey?: NewsletterTemplateKey;
  issueDate: string;
  grantsConsidered: number;
  grantsIncluded: number;
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
  issueId?: string;
}> {
  const issueDate = options?.issueDate ?? new Date();
  const maxGrants = Math.max(1, Math.min(12, options?.maxGrants ?? 7));
  const enabled = isEnabled();
  const dryRun = isDryRun();

  if (!enabled) {
    return {
      enabled,
      dryRun,
      issueDate: dayKey(issueDate),
      grantsConsidered: 0,
      grantsIncluded: 0,
      recipients: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const supabase = getSupabaseAdmin();

  // Select grants: prefer fresh + live URLs, deadlines in the future.
  const since = new Date(issueDate);
  since.setDate(since.getDate() - 2);
  const { data: grantsRaw = [] } = await supabase
    .from("Grant")
    .select("id, name, funder, amount, deadline, applicationUrl, description, sectors, regions, url_status, createdAt, created_at")
    .neq("url_status", "dead")
    .neq("url_status", "expired")
    .order("createdAt", { ascending: false })
    .limit(80);

  const now = new Date();
  const grantsFiltered = (grantsRaw ?? []).filter((g: NewsletterGrantItem) => {
    const url = (g.applicationUrl ?? "").trim();
    if (!url) return false;
    const status = (g.url_status ?? "unknown") as string;
    if (status === "dead" || status === "expired") return false;
    if (g.deadline) {
      const d = new Date(g.deadline);
      if (Number.isFinite(d.getTime()) && d.getTime() < now.getTime()) return false;
    }
    const created = (g.createdAt ?? g.created_at) ? new Date((g.createdAt ?? g.created_at) as string) : null;
    if (created && Number.isFinite(created.getTime()) && created.getTime() < since.getTime()) {
      // Allow older if deadline is soon and it’s still live; otherwise bias to fresh.
      if (!g.deadline) return false;
      const d = new Date(g.deadline);
      const days = (d.getTime() - now.getTime()) / 86_400_000;
      if (!Number.isFinite(days) || days > 21) return false;
    }
    return true;
  });

  const grants = grantsFiltered.slice(0, maxGrants);
  const templateKey = pickTemplateKey(issueDate);
  const { subject, html, text } = renderTemplate(templateKey, issueDate, grants);

  // Upsert / reuse issue for date (idempotent).
  const issueDateKey = dayKey(issueDate);
  let issueId: string | undefined;
  const { data: existingIssue } = await supabase
    .from("NewsletterIssue")
    .select("id")
    .eq("issueDate", issueDateKey)
    .maybeSingle();

  if (existingIssue?.id) {
    issueId = existingIssue.id;
    await supabase
      .from("NewsletterIssue")
      .update({ templateKey, subject, html, text })
      .eq("id", issueId);
  } else {
    const { data: createdIssue, error: createErr } = await supabase
      .from("NewsletterIssue")
      .insert({ issueDate: issueDateKey, templateKey, subject, html, text })
      .select("id")
      .single();
    if (createErr) throw createErr;
    issueId = createdIssue?.id;
  }

  // Recipients: env override wins; else DB list.
  const override = parseRecipientOverride();
  let recipients: string[] = [];
  if (override?.length) {
    recipients = override;
  } else {
    const { data: rows = [] } = await supabase
      .from("NewsletterRecipient")
      .select("email, active")
      .eq("active", true);
    recipients = (rows ?? [])
      .map((r: { email?: string }) => String(r.email ?? "").trim())
      .filter(Boolean);
  }

  if (recipients.length === 0) {
    return {
      enabled,
      dryRun,
      templateKey,
      issueDate: issueDateKey,
      grantsConsidered: (grantsRaw ?? []).length,
      grantsIncluded: grants.length,
      recipients: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      issueId,
    };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const email of recipients) {
    // idempotency: skip if already logged for this issue/email
    const { data: existingLog } = await supabase
      .from("NewsletterSendLog")
      .select("id, status")
      .eq("issueId", issueId)
      .eq("recipientEmail", email)
      .maybeSingle();

    if (existingLog?.id) {
      skipped++;
      continue;
    }

    if (dryRun) {
      await supabase.from("NewsletterSendLog").insert({
        issueId,
        recipientEmail: email,
        status: "skipped",
        error: "dry_run",
      });
      skipped++;
      continue;
    }

    const result = await sendEmail(email, subject, html, text);
    await supabase.from("NewsletterSendLog").insert({
      issueId,
      recipientEmail: email,
      status: result.success ? "sent" : "failed",
      error: result.error ?? null,
    });
    if (result.success) sent++;
    else failed++;
  }

  return {
    enabled,
    dryRun,
    templateKey,
    issueDate: issueDateKey,
    grantsConsidered: (grantsRaw ?? []).length,
    grantsIncluded: grants.length,
    recipients: recipients.length,
    sent,
    skipped,
    failed,
    issueId,
  };
}

