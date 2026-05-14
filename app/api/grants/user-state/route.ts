import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { markGrantUserState } from "@/lib/grant-user-state";

const schema = z.object({
  grantId: z.string().min(1),
  status: z.enum(["saved", "viewed", "deferred", "applied", "dismissed"]),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile) {
      return NextResponse.json({ error: "Complete your business profile first." }, { status: 400 });
    }

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid grant state request" }, { status: 400 });
    }

    await markGrantUserState(getSupabaseAdmin(), {
      organisationId: orgId,
      profileId: profile.id,
      grantId: parsed.data.grantId,
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    );
  }
}
