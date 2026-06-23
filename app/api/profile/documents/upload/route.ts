import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requestEligibilityRefresh } from "@/lib/eligibility-refresh-trigger";
import { syncGrantMemoryFromProfile } from "@/lib/grant-memory";

const BUCKET = "documents";
const MAX_SIZE_DOC = 10 * 1024 * 1024; // 10MB
const MAX_SIZE_VIDEO = 100 * 1024 * 1024; // 100MB for video

async function refreshProfileAfterDocumentUpload(profileId: string, organisationId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from("BusinessProfile")
    .select("businessName, location, sector, missionStatement, description, employeeCount, annualRevenue, fundingMin, fundingMax, fundingPurposes")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return;

  const { count } = await supabase
    .from("Document")
    .select("id", { count: "exact", head: true })
    .eq("profileId", profileId);

  let score = 0;
  if (profile.businessName?.trim()) score++;
  if (profile.location?.trim()) score++;
  if (profile.sector?.trim()) score++;
  if (profile.missionStatement?.trim()) score++;
  if (profile.description?.trim()) score++;
  if (profile.employeeCount != null && Number(profile.employeeCount) > 0) score++;
  if (profile.annualRevenue != null && Number(profile.annualRevenue) > 0) score++;
  if (profile.fundingMin != null && Number(profile.fundingMin) > 0) score++;
  if (profile.fundingMax != null && Number(profile.fundingMax) > 0) score++;
  if (Array.isArray(profile.fundingPurposes) && profile.fundingPurposes.length > 0) score++;
  if ((count ?? 0) >= 1) score++;

  await supabase
    .from("BusinessProfile")
    .update({ completionScore: Math.round((score / 11) * 100) })
    .eq("id", profileId);

  await syncGrantMemoryFromProfile(profileId, organisationId).catch((error) =>
    console.error("[documents/upload] Grant memory sync failed:", error)
  );
  await requestEligibilityRefresh(organisationId, "profile.document.uploaded").catch((error) =>
    console.error("[documents/upload] Eligibility refresh trigger failed:", error)
  );
}

export async function POST(request: Request) {
  try {
    const { orgId, profile: activeProfile } = await getActiveOrg();
    const profileId = activeProfile?.id;
    if (!profileId) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("BusinessProfile")
      .select("id")
      .eq("id", profileId)
      .eq("organisationId", orgId)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const isVideo = (file.type || "").startsWith("video/");
    const maxSize = isVideo ? MAX_SIZE_VIDEO : MAX_SIZE_DOC;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: isVideo ? "Video must be under 100MB" : "File must be under 10MB" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() ?? "bin";
    const filePath = `profiles/${profile.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[documents/upload] Storage error:", uploadError);
      return NextResponse.json(
        { error: uploadError.message || "Storage upload failed" },
        { status: 502 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    const docInsert: Record<string, unknown> = {
      profileId: profile.id,
      name: file.name,
      url: publicUrl,
      type: file.type,
      size: file.size,
    };
    if (category && category.trim()) docInsert.category = category.trim();
    const { data: document, error: docError } = await supabase
      .from("Document")
      .insert(docInsert)
      .select("id, name, url, type, size, category")
      .single();

    if (docError || !document) {
      console.error("[documents/upload] Document insert error:", docError);
      return NextResponse.json({ error: "Failed to save document record" }, { status: 502 });
    }

    await refreshProfileAfterDocumentUpload(profile.id, orgId).catch((error) =>
      console.error("[documents/upload] Profile refresh failed:", error)
    );

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        name: document.name,
        url: document.url,
        type: document.type,
        size: document.size,
        category: (document as { category?: string }).category ?? null,
      },
    });
  } catch (err) {
    console.error("[documents/upload]", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
