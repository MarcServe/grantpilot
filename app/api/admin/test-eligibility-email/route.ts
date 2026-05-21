import { NextResponse } from "next/server";
import { ADMIN_EMAIL, isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyUser } from "@/lib/notify";

/**
 * POST /api/admin/test-eligibility-email
 * Sends one email-only eligibility digest test to the primary admin account.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await isAdmin();
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = user as Record<string, unknown>;
  const id = (raw.id ?? raw.user_id) as string | undefined;
  const email = String(raw.email ?? "").trim().toLowerCase();
  if (!id || email !== ADMIN_EMAIL) {
    return NextResponse.json(
      { error: `This test is locked to ${ADMIN_EMAIL}.` },
      { status: 403 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: firstGrant } = await supabase
    .from("Grant")
    .select("id, name")
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  const grantId = (firstGrant as { id?: string } | null)?.id ?? "test-grant";
  const grantName =
    (firstGrant as { name?: string } | null)?.name ??
    "Test eligibility grant";

  await notifyUser(
    {
      id,
      email: ADMIN_EMAIL,
      phoneNumber: null,
      whatsappOptIn: false,
    },
    "grant_scan_digest",
    {
      profileName: "Admin test profile",
      grants: [
        {
          grantId,
          grantName,
          score: 85,
          summary:
            "This is an email-only test of the GrantsCopilot eligibility digest notification.",
        },
      ],
    },
    { sendEmail: true, sendWhatsApp: false }
  );

  const { data: logs } = await supabase
    .from("NotificationLog")
    .select("channel, status, error")
    .eq("userId", id)
    .eq("type", "grant_scan_digest")
    .eq("channel", "email")
    .order("createdAt", { ascending: false })
    .limit(1);

  const latest = (logs ?? [])[0] as
    | { channel: string; status: string; error: string | null }
    | undefined;

  return NextResponse.json({
    ok: latest?.status === "sent",
    message:
      latest?.status === "sent"
        ? `Eligibility test email sent to ${ADMIN_EMAIL}.`
        : "Eligibility test email attempted.",
    email: latest?.status ?? "unknown",
    error: latest?.error ?? undefined,
  });
}
