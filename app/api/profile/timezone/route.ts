import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { VALID_TIMEZONES } from "@/lib/timezone";

export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.timezone === "string" ? body.timezone.trim() : "";
    const timezone = raw && raw !== "UTC" ? raw : null;

    if (timezone != null && !VALID_TIMEZONES.includes(timezone as (typeof VALID_TIMEZONES)[number])) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }

    const { error } = await getSupabaseAdmin()
      .from("Organisation")
      .update({ preferredTimezone: timezone })
      .eq("id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, timezone });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update timezone";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
