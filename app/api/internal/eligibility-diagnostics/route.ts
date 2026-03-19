import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * GET /api/internal/eligibility-diagnostics?orgId=...&days=7
 * Explains why scores/notifications may be missing for an organisation.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");
    const days = Math.max(1, Number(url.searchParams.get("days") ?? "7"));
    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    let { data: profileRows = [] } = await supabase
      .from("BusinessProfile")
      .select("id, completionScore, businessName")
      .eq("organisationId", orgId)
      .order("updatedAt", { ascending: false })
      .limit(3);
    if (!profileRows || profileRows.length === 0) {
      const alt = await supabase
        .from("BusinessProfile")
        .select("id, completionScore, businessName")
        .eq("organisation_id", orgId)
        .order("updatedAt", { ascending: false })
        .limit(3);
      profileRows = alt.data ?? [];
    }
    const profiles = Array.isArray(profileRows) ? profileRows as { id: string; completionScore?: number; businessName?: string }[] : [];
    const profile = profiles[0] ?? null;

    const { data: prefs } = await supabase
      .from("EligibilityNotificationPreference")
      .select("min_score, max_score, eligible_threshold, notify_email, notify_in_app, notify_whatsapp")
      .eq("organisation_id", orgId)
      .maybeSingle();

    const { count: assessmentCount } = await supabase
      .from("EligibilityAssessment")
      .select("grant_id", { count: "exact", head: true })
      .eq("organisation_id", orgId);

    const since = new Date();
    since.setDate(since.getDate() - days);
    let { data: members = [] } = await supabase
      .from("OrganisationMember")
      .select("user_id")
      .eq("organisation_id", orgId);
    if (!members || members.length === 0) {
      const alt = await supabase
        .from("OrganisationMember")
        .select("userId")
        .eq("organisationId", orgId);
      members = alt.data ?? [];
    }
    const userIds = (members as { user_id?: string }[])
      .map((m) => m.user_id ?? (m as { userId?: string }).userId)
      .filter((id): id is string => Boolean(id));

    let logs: { channel: string; type: string; status: string; error: string | null }[] = [];
    if (userIds.length > 0) {
      const { data: logRows = [] } = await supabase
        .from("NotificationLog")
        .select("channel, type, status, error")
        .in("userId", userIds)
        .in("type", ["grant_scan_digest", "grant_match_high"])
        .gte("createdAt", since.toISOString())
        .order("createdAt", { ascending: false })
        .limit(200);
      logs = (logRows ?? []) as { channel: string; type: string; status: string; error: string | null }[];
    }

    const byTypeChannel: Record<string, Record<string, { sent: number; failed: number; skipped: number }>> = {};
    for (const log of logs) {
      byTypeChannel[log.type] ??= {};
      byTypeChannel[log.type][log.channel] ??= { sent: 0, failed: 0, skipped: 0 };
      if (log.status === "sent") byTypeChannel[log.type][log.channel].sent += 1;
      else if (log.status === "failed") byTypeChannel[log.type][log.channel].failed += 1;
      else byTypeChannel[log.type][log.channel].skipped += 1;
    }

    const blockers: string[] = [];
    if (!profile) blockers.push("No BusinessProfile found for organisation.");
    if (profile && (profile.completionScore ?? 0) < 50) {
      blockers.push(`Profile completion is ${(profile.completionScore ?? 0)}%; eligibility refresh requires >= 50%.`);
    }
    if ((assessmentCount ?? 0) === 0) blockers.push("No rows in EligibilityAssessment for this organisation yet.");
    const p = prefs as { notify_email?: boolean; notify_whatsapp?: boolean } | null;
    if (p && p.notify_email === false) blockers.push("Eligibility email notifications are disabled by preference.");
    if (p && p.notify_whatsapp === false) blockers.push("Eligibility WhatsApp notifications are disabled by preference.");

    return NextResponse.json({
      ok: true,
      orgId,
      profile: profile
        ? { id: profile.id, businessName: profile.businessName ?? null, completionScore: profile.completionScore ?? 0 }
        : null,
      preferences: prefs ?? null,
      assessmentCount: assessmentCount ?? 0,
      notificationsLastNDays: {
        days,
        totalsByTypeAndChannel: byTypeChannel,
      },
      blockers,
    });
  } catch (e) {
    console.error("[internal/eligibility-diagnostics]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
