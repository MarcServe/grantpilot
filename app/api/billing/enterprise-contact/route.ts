import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

const enterpriseContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  company: z.string().trim().min(2).max(160),
  teamSize: z.string().trim().max(80).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
});

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
    const parsed = enterpriseContactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid enterprise enquiry" },
        { status: 400 }
      );
    }

    const { name, email, company, teamSize, message } = parsed.data;
    const html = `
      <h2>Enterprise plan enquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Company:</strong> ${escapeHtml(company)}</p>
      <p><strong>Team size / profiles:</strong> ${escapeHtml(teamSize || "Not provided")}</p>
      <p><strong>Signed-in user:</strong> ${escapeHtml(String(user.email ?? "Unknown"))}</p>
      <p><strong>Organisation:</strong> ${escapeHtml(String(org.name ?? "Unknown"))} (${escapeHtml(orgId)})</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message || "No message provided.").replace(/\n/g, "<br />")}</p>
    `;

    const result = await sendEmail(
      "billing@grantscopilot.com",
      `Enterprise plan enquiry from ${company}`,
      html
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Could not send enterprise enquiry" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit enterprise enquiry" },
      { status: 500 }
    );
  }
}
