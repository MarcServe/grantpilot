import { NextResponse } from "next/server";
import { getActiveOrg, getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncEligibilityWhatsAppPreference } from "@/lib/eligibility-preferences";
import { organisationAllowsCapability } from "@/lib/plan-check";
import { PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";

/**
 * GET /api/profile/notification-channels
 * Returns current user's WhatsApp opt-in and whether they have a phone number.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = user as Record<string, unknown>;
  const phoneNumber = (raw.phoneNumber ?? raw.phone_number) as string | null | undefined;
  const whatsappOptIn = Boolean(raw.whatsappOptIn ?? raw.whatsapp_opt_in);
  const hasPhone = Boolean(phoneNumber && String(phoneNumber).trim().length >= 10);
  return NextResponse.json({ whatsappOptIn, hasPhone });
}

/**
 * PATCH /api/profile/notification-channels
 * Body: { whatsappOptIn: boolean }
 * Updates the current user's WhatsApp opt-in (for grant match and deadline notifications).
 */
export async function PATCH(req: Request) {
  let activeOrg;
  try {
    activeOrg = await getActiveOrg();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, orgId } = activeOrg;
  let body: { whatsappOptIn?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const whatsappOptIn = Boolean(body.whatsappOptIn);
  if (whatsappOptIn && !(await organisationAllowsCapability(orgId, "whatsapp_opportunity_alerts"))) {
    return NextResponse.json(
      { error: PLAN_CAPABILITY_MESSAGES.whatsapp_opportunity_alerts, code: "FEATURE_FORBIDDEN" },
      { status: 402 }
    );
  }
  const userId = (user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "User not found" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const update: Record<string, unknown> = {
    whatsappOptIn,
  };
  if (whatsappOptIn) {
    update.whatsappOptInAt = new Date().toISOString();
  }
  const { error } = await supabase.from("User").update(update).eq("id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  try {
    await syncEligibilityWhatsAppPreference(orgId, whatsappOptIn);
  } catch (e) {
    console.error("[NOTIFICATION_CHANNELS] sync eligibility WhatsApp", e);
    return NextResponse.json({ error: "WhatsApp was saved, but eligibility WhatsApp could not be synced." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, whatsappOptIn });
}
