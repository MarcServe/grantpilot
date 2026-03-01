import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  checkRequirementsAgainstDocuments,
  type RequiredAttachment,
} from "@/lib/grant-requirements";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const url = new URL(req.url);
    const grantId = url.searchParams.get("grantId");
    const profileId = url.searchParams.get("profileId");
    if (!grantId || !profileId) {
      return NextResponse.json(
        { error: "grantId and profileId required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: grant } = await supabase
      .from("Grant")
      .select("id, name, eligibility, required_attachments")
      .eq("id", grantId)
      .single();
    if (!grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from("BusinessProfile")
      .select("id")
      .eq("id", profileId)
      .eq("organisationId", orgId)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const rawRequired = (grant as { required_attachments?: unknown }).required_attachments;
    const required: RequiredAttachment[] = Array.isArray(rawRequired)
      ? rawRequired.filter(
          (r): r is RequiredAttachment =>
            r != null &&
            typeof r === "object" &&
            (r as RequiredAttachment).kind != null &&
            typeof (r as RequiredAttachment).label === "string"
        )
      : [];

    const { data: docRows } = await supabase
      .from("Document")
      .select("id, name, type, category")
      .eq("profileId", profileId);
    const docAlt = !docRows?.length
      ? await supabase
          .from("Document")
          .select("id, name, type, category")
          .eq("profile_id", profileId)
      : { data: docRows };
    const documents = (docAlt.data ?? []).map((d: { name: string; type?: string; category?: string }) => ({
      name: d.name,
      type: d.type,
      category: d.category,
    }));

    const { met, missing } = checkRequirementsAgainstDocuments(required, documents);

    return NextResponse.json({
      requiredAttachments: required,
      met,
      missing,
    });
  } catch (e) {
    console.error("[APPLICATIONS_START_CHECK]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
