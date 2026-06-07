import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

const feedbackSchema = z.object({
  category: z.enum(["feature_request", "product_feedback", "bug_report", "other"]),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(4000),
  contactEmail: z.string().trim().email().max(160).optional().nullable(),
});

const CATEGORY_LABELS: Record<z.infer<typeof feedbackSchema>["category"], string> = {
  feature_request: "Feature request",
  product_feedback: "Product feedback",
  bug_report: "Bug report",
  other: "Other feedback",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { org, orgId, user } = await getActiveOrg();
    const body = await req.json().catch(() => null);
    const parsed = feedbackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid feedback" },
        { status: 400 }
      );
    }

    const { category, subject, message, contactEmail } = parsed.data;
    const replyEmail = contactEmail || String(user.email ?? "");
    const html = `
      <h2>${escapeHtml(CATEGORY_LABELS[category])}</h2>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <p><strong>Contact email:</strong> ${escapeHtml(replyEmail || "Not provided")}</p>
      <p><strong>Signed-in user:</strong> ${escapeHtml(String(user.email ?? "Unknown"))}</p>
      <p><strong>Organisation:</strong> ${escapeHtml(String(org.name ?? "Unknown"))} (${escapeHtml(orgId)})</p>
      <p><strong>Feedback:</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>
    `;

    const result = await sendEmail(
      "notifications@grantscopilot.com",
      `${CATEGORY_LABELS[category]}: ${subject}`,
      html
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Could not send feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit feedback" },
      { status: 500 }
    );
  }
}
