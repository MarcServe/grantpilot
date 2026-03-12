import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyUser } from "@/lib/notify";

/**
 * POST /api/admin/test-notification
 * Sends a test grant_match_high notification to the current admin (email + WhatsApp if configured).
 * Admin only.
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
  const email = (raw.email as string) ?? "";
  if (!id || !email) {
    return NextResponse.json({ error: "User record incomplete" }, { status: 400 });
  }
  const phoneNumber = (raw.phoneNumber ?? raw.phone_number) as string | null | undefined;
  const notifyUserPayload = {
    id,
    email,
    phoneNumber: phoneNumber ?? null,
    whatsappOptIn: Boolean(raw.whatsappOptIn ?? raw.whatsapp_opt_in),
  };

  const supabase = getSupabaseAdmin();
  const { data: firstGrant } = await supabase
    .from("Grant")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  const grantId = (firstGrant as { id?: string } | null)?.id;
  const grantName = (firstGrant as { name?: string } | null)?.name ?? "Test grant (Grants-Copilot)";

  try {
    await notifyUser(notifyUserPayload, "grant_match_high", {
      grantName,
      grantId: grantId ?? undefined,
      score: 85,
    });

    const { data: logs } = await supabase
      .from("NotificationLog")
      .select("channel, status, error")
      .eq("userId", id)
      .eq("type", "grant_match_high")
      .order("createdAt", { ascending: false })
      .limit(5);

    const emailLog = (logs ?? []).find((r: { channel: string }) => r.channel === "email");
    const whatsappLog = (logs ?? []).find((r: { channel: string }) => r.channel === "whatsapp");
    const emailStatus = (emailLog as { status?: string } | undefined)?.status ?? "unknown";
    const whatsappStatus = (whatsappLog as { status?: string } | undefined)?.status ?? "unknown";
    const whatsappError = (whatsappLog as { error?: string | null } | undefined)?.error ?? null;

    let whatsappReason = "";
    if (whatsappStatus === "skipped" && whatsappError) {
      if (whatsappError === "whatsapp_requires_template") {
        whatsappReason = "Set TWILIO_WHATSAPP_GRANT_MATCH_CONTENT_SID in Vercel and use an approved Content Template with placeholder {{3}} for the grant link.";
      } else if (whatsappError === "no_phone") {
        whatsappReason = "Add your phone number in Profile and opt in to WhatsApp.";
      } else {
        whatsappReason = whatsappError;
      }
    } else if (whatsappStatus === "failed" && whatsappError) {
      whatsappReason = whatsappError;
    }

    return NextResponse.json({
      ok: true,
      message: "Test notification sent.",
      email: emailStatus,
      whatsapp: whatsappStatus,
      whatsappReason: whatsappReason || undefined,
    });
  } catch (e) {
    console.error("[admin/test-notification]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send test notification" },
      { status: 500 }
    );
  }
}
