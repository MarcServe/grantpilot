import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyApproveToken } from "@/lib/approve-token";
import { getSupabaseAdmin } from "@/lib/supabase";

const bodySchema = z.object({
  applicationId: z.string().min(1),
  token: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { applicationId, token } = parsed.data;
    const verifiedId = verifyApproveToken(token);
    if (!verifiedId || verifiedId !== applicationId) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: app } = await supabase
      .from("Application")
      .select("id, status")
      .eq("id", applicationId)
      .single();

    if (!app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const status = (app as { status: string }).status;
    if (status !== "REVIEW_REQUIRED" && status !== "FILLING") {
      return NextResponse.json(
        { error: "Application is not pending approval" },
        { status: 400 }
      );
    }

    await supabase
      .from("Application")
      .update({ status: "APPROVED" })
      .eq("id", applicationId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[APPLICATIONS_APPROVE]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
