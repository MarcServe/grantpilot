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
    return NextResponse.json({
      ok: true,
      message: "Test notification sent to your email and WhatsApp (if phone and template are configured).",
    });
  } catch (e) {
    console.error("[admin/test-notification]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send test notification" },
      { status: 500 }
    );
  }
}
