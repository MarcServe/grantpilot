import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "documents";
const MAX_SIZE_DOC = 10 * 1024 * 1024; // 10MB
const MAX_SIZE_VIDEO = 100 * 1024 * 1024; // 100MB for video

export async function POST(request: Request) {
  try {
    const { orgId } = await getActiveOrg();

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("BusinessProfile")
      .select("id")
      .eq("organisationId", orgId)
      .limit(1)
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
