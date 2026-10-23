import { DEADLINE_EXPORT_DAY_OPTIONS, deadlineExportEnd } from "@/lib/deadline-export-options";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createDeadlinePost } from "@/lib/deadline-social-image";
import { socialGrantDetails, socialDetailsCsv, SOCIAL_EXPORT_LIMIT } from "@/lib/deadline-social-bundle";
import { createZip } from "@/lib/zip-archive";
export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z.object({
  scope: z.enum(["upcoming", "selected"]),
  deadlineDays: z.number().int().refine(value => (DEADLINE_EXPORT_DAY_OPTIONS as readonly number[]).includes(value)).default(7),
  grantIds: z.array(z.string().min(1).max(200)).max(SOCIAL_EXPORT_LIMIT).default([]),
  format: z.enum(["square", "portrait", "both", "details"]).default("both"),
});
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.scope === "selected" && !parsed.data.grantIds.length)) return NextResponse.json({ error: "Select at least one grant and a valid export format." }, { status: 400 });
  try {
    const now = new Date();
    const end = deadlineExportEnd(parsed.data.deadlineDays, now);
    let query = getSupabaseAdmin({ timeoutMs: 10000 }).from("Grant")
      .select("id,name,funder,deadline,description,eligibility,objectives,applicationUrl,amount,fundingValueType,applicantMaxAmount,applicantTypicalAmount,programmeTotalAmount,fundingValueEvidence,regions,sectors,applicantTypes")
      .gte("deadline", now.toISOString()).lte("deadline", end.toISOString())
      .order("deadline", { ascending: true }).order("id").limit(SOCIAL_EXPORT_LIMIT + 1);
    if (parsed.data.scope === "selected") query = query.in("id", parsed.data.grantIds);
    const result = await query;
    if (result.error) throw new Error("Could not load deadline details.");
    const grants = (result.data ?? []).slice(0, SOCIAL_EXPORT_LIMIT);
    if (!grants.length) return NextResponse.json({ error: "No upcoming deadlines found for this selection." }, { status: 404 });
    const rows = grants.map(socialGrantDetails);
    const files: Record<string, string | Buffer> = {
      "grant-details.csv": socialDetailsCsv(rows),
      "grant-details.json": JSON.stringify(rows, null, 2),
      "all-captions.txt": rows.map(row => row.caption).join("\n\n--------------------\n\n"),
    };
    const skipped: string[] = [];
    // Render sequentially to bound PNG memory and CPU usage in serverless functions.
    for (const row of rows) {
      files[`captions/${row.filename}.txt`] = row.caption;
      const formats = parsed.data.format === "both" ? ["square", "portrait"] as const : parsed.data.format === "details" ? [] : [parsed.data.format];
      for (const format of formats) {
        try {
          files[`images/${row.filename}-${format}.png`] = Buffer.from(await createDeadlinePost(row, format).arrayBuffer());
        } catch { skipped.push(`${row.name} (${format})`); }
      }
    }
    const more = (result.data?.length ?? 0) > SOCIAL_EXPORT_LIMIT;
    files["README.txt"] = `GrantsCopilot deadline social pack\nGenerated: ${now.toISOString()}\nDeadline window: next ${parsed.data.deadlineDays} days (${now.toISOString()} through ${end.toISOString()})\nGrants: ${rows.length}\nImages: ${parsed.data.format}\n\nEach caption includes Powered by GrantsCopilot and https://www.grantscopilot.com.\nReview all details and confirm eligibility, funding terms and closing times with the funder before publishing. No posts have been published automatically.\nDates are displayed in Europe/London; original deadline timestamps are in the CSV/JSON.\n${more ? "This archive contains the nearest 25 deadlines. More grants remain outside this 25-grant batch.\n" : ""}${skipped.length ? `Images that could not be rendered (captions and details are included):\n${skipped.join("\n")}` : "All requested images rendered successfully."}`;
    return new NextResponse(new Uint8Array(createZip(files)), { headers: {
      "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="grantscopilot-deadlines-${parsed.data.deadlineDays}days-${now.toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store", "X-Export-Count": String(rows.length), "X-Export-More": String(more), "X-Export-Skipped-Images": String(skipped.length),
    } });
  } catch (error) {
    console.error("[deadline-social-bundle]", error instanceof Error ? error.message : "Export failed");
    return NextResponse.json({ error: "Could not prepare the social pack. Try a smaller selection or details-only export." }, { status: 502 });
  }
}
