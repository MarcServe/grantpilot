import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseRequiredAttachmentsFromText } from "@/lib/grant-requirements";

/**
 * Parse grant eligibility/description for required attachments (video, documents)
 * and save to Grant.required_attachments. Call when editing a grant or after ingest.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await getActiveOrg();
    const { id: grantId } = await params;

    const supabase = getSupabaseAdmin();
    const { data: grant, error: fetchError } = await supabase
      .from("Grant")
      .select("id, eligibility, description")
      .eq("id", grantId)
      .single();

    if (fetchError || !grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const text = [grant.eligibility, grant.description].filter(Boolean).join("\n\n");
    const required = await parseRequiredAttachmentsFromText(text);

    const { error: updateError } = await supabase
      .from("Grant")
      .update({ required_attachments: required })
      .eq("id", grantId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message ?? "Failed to save" },
        { status: 502 }
      );
    }

    return NextResponse.json({ requiredAttachments: required });
  } catch (e) {
    console.error("[GRANTS_PARSE_REQUIREMENTS]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
