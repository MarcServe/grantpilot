import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";

const submitSchema = z.object({
  applicationId: z.string().min(1),
  confirmed: z.literal(true),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();

    const body = await req.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input. You must confirm the checkbox." },
        { status: 400 }
      );
    }

    const { applicationId } = parsed.data;

    const supabase = getSupabaseAdmin();

    const { data: application } = await supabase
      .from("Application")
      .select("id, status")
      .eq("id", applicationId)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    if (application.status === "SUBMITTED") {
      return NextResponse.json(
        { error: "Application already submitted" },
        { status: 400 }
      );
    }
    const publicId = `grantapp_${applicationId}`;

    const { data: session } = await supabase
      .from("cu_sessions")
      .select("id, status")
      .eq("public_id", publicId)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: "Execution session not found" },
        { status: 404 }
      );
    }

    await supabase.from("cu_session_items").insert({
      session_id: session.id,
      task_type: "grant_application",
      action: "submit_application",
      status: "pending",
    });

    if (session.status === "completed") {
      await supabase
        .from("cu_sessions")
        .update({ status: "resumed" })
        .eq("id", session.id);
    }

    await supabase
      .from("Application")
      .update({ status: "APPROVED" })
      .eq("id", applicationId);

    const { data: updatedApp } = await supabase
      .from("Application")
      .select("id, Grant(name)")
      .eq("id", applicationId)
      .single();

    const grantObj = updatedApp?.Grant as { name?: string } | { name?: string }[] | undefined;
    const grantName =
      (Array.isArray(grantObj) ? grantObj[0]?.name : grantObj?.name) ?? "Grant";

    notifyOrgMembers(orgId, "application_submitted", {
      grantName,
      applicationId: applicationId,
    }).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[APPLICATION_SUBMIT]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
