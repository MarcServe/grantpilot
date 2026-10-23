import { socialGrantDetails } from "@/lib/deadline-social-bundle";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createDeadlinePost, deadlinePostDate } from "@/lib/deadline-social-image";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "square";
  if (format !== "square" && format !== "portrait") return NextResponse.json({ error: "Choose square or portrait format" }, { status: 400 });
  const { data: grant, error } = await getSupabaseAdmin({ timeoutMs: 8000 }).from("Grant")
    .select("id,name,funder,deadline,description,eligibility,objectives,applicationUrl,amount,fundingValueType,applicantMaxAmount,applicantTypicalAmount,programmeTotalAmount,fundingValueEvidence,regions,sectors,applicantTypes").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load grant details" }, { status: 502 });
  if (!grant) return NextResponse.json({ error: "Grant not found" }, { status: 404 });
  try { deadlinePostDate(grant.deadline); } catch {
    return NextResponse.json({ error: "This grant needs a confirmed deadline date before creating a social post." }, { status: 400 });
  }
  if (url.searchParams.get("content") === "1") return NextResponse.json(socialGrantDetails(grant), { headers: { "Cache-Control": "private, no-store" } });
  const response = createDeadlinePost(grant, format);
  response.headers.set("Cache-Control", "private, no-store");
  if (url.searchParams.get("download") === "1") {
    const slug = grant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 70).replace(/-$/, "") || "grant";
    response.headers.set("Content-Disposition", `attachment; filename="${slug}-deadline-${format}.png"`);
  }
  return response;
}
