import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { encryptPassword } from "@/lib/portal-encryption";

const createSchema = z.object({
  portalHost: z.string().min(1),
  portalName: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

/** GET — list portal credentials for the current org (passwords masked). */
export async function GET(): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("PortalCredential")
      .select("id, portalHost, portalName, username, createdAt, updatedAt")
      .eq("organisationId", orgId)
      .order("portalName", { ascending: true });

    if (error) {
      console.error("[PORTAL_CREDENTIALS] list error:", error);
      return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 });
    }

    return NextResponse.json({ credentials: data ?? [] });
  } catch (err) {
    console.error("[PORTAL_CREDENTIALS] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST — save or update a portal credential. */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { portalHost, portalName, username, password } = parsed.data;
    const supabase = getSupabaseAdmin();

    let encrypted: string;
    try {
      encrypted = encryptPassword(password);
    } catch (e) {
      console.error("[PORTAL_CREDENTIALS] encryption error:", e);
      return NextResponse.json(
        { error: "Encryption not configured. Ask your admin to set PORTAL_ENCRYPTION_KEY." },
        { status: 500 }
      );
    }

    const { data: existing } = await supabase
      .from("PortalCredential")
      .select("id")
      .eq("organisationId", orgId)
      .eq("portalHost", portalHost)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("PortalCredential")
        .update({
          portalName,
          username,
          encryptedPassword: encrypted,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", (existing as { id: string }).id);
      if (error) {
        return NextResponse.json({ error: "Failed to update credential" }, { status: 500 });
      }
      return NextResponse.json({ updated: true });
    }

    const { error } = await supabase
      .from("PortalCredential")
      .insert({
        organisationId: orgId,
        portalHost,
        portalName,
        username,
        encryptedPassword: encrypted,
      });

    if (error) {
      console.error("[PORTAL_CREDENTIALS] insert error:", error);
      return NextResponse.json({ error: "Failed to save credential" }, { status: 500 });
    }

    return NextResponse.json({ created: true });
  } catch (err) {
    console.error("[PORTAL_CREDENTIALS] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** DELETE — remove a credential by id. */
export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("PortalCredential")
      .delete()
      .eq("id", id)
      .eq("organisationId", orgId);

    if (error) {
      return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[PORTAL_CREDENTIALS] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
