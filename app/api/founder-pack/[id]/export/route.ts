import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  founderPackExportFilename,
  founderPackExportMime,
  generateFounderPackExport,
  isFounderPackExportFormat,
  type FounderPackExportInput,
} from "@/lib/founder-pack-export";
import { sanitiseFounderPackContent, type FounderPackContent, type FounderPackDocumentType } from "@/lib/founder-pack";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format");
    if (!isFounderPackExportFormat(format)) {
      return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
    }

    const { orgId } = await getActiveOrg();
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    const { data: pack, error: packError } = await supabase
      .from("FounderFundingPack")
      .select("id, organisationId, profileId, type, inputs, content, createdAt")
      .eq("id", id)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (packError) return NextResponse.json({ error: packError.message }, { status: 502 });
    if (!pack) return NextResponse.json({ error: "Founder pack not found" }, { status: 404 });

    const { data: profile, error: profileError } = await supabase
      .from("BusinessProfile")
      .select("businessName, sector")
      .eq("id", String(pack.profileId))
      .eq("organisationId", orgId)
      .maybeSingle();

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 502 });

    const businessName = String(profile?.businessName ?? "Founder Pack");
    const exportPack: FounderPackExportInput = {
      id: String(pack.id),
      createdAt: String(pack.createdAt ?? ""),
      type: String(pack.type ?? ""),
      inputs: normaliseInputs(pack.inputs),
      content: sanitiseFounderPackContent(pack.content as FounderPackContent, { businessName }),
      profile: {
        businessName,
        sector: String(profile?.sector ?? ""),
      },
    };
    const body = generateFounderPackExport(exportPack, format);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": founderPackExportMime(format),
        "Content-Disposition": `attachment; filename="${founderPackExportFilename(exportPack, format)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[FOUNDER_PACK_EXPORT]", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normaliseInputs(value: unknown): FounderPackExportInput["inputs"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  return {
    founderName: String(input.founderName ?? ""),
    founderRole: String(input.founderRole ?? ""),
    documentTypes: Array.isArray(input.documentTypes)
      ? input.documentTypes.map((item) => String(item) as FounderPackDocumentType)
      : undefined,
  };
}
