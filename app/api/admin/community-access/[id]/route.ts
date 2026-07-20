import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { communityAccessUrl, generateCommunityAccessToken, hashCommunityAccessToken } from "@/lib/community-access";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function originFromRequest(request: Request): string {
  const url = new URL(request.url);
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  return configured?.trim() || url.origin;
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (typeof body.active === "boolean") updates.active = body.active;
  const replacementToken = body.rotateToken === true ? generateCommunityAccessToken() : null;
  if (replacementToken) {
    updates.tokenHash = hashCommunityAccessToken(replacementToken);
  }
  if (typeof body.maxRedemptions === "number" && Number.isFinite(body.maxRedemptions) && body.maxRedemptions > 0) {
    updates.maxRedemptions = Math.floor(body.maxRedemptions);
  }
  if (typeof body.redeemBy === "string") {
    if (body.redeemBy) {
      const redeemBy = new Date(body.redeemBy);
      if (Number.isNaN(redeemBy.getTime())) {
        return NextResponse.json({ error: "Redeem-by date is invalid" }, { status: 400 });
      }
      updates.redeemBy = redeemBy.toISOString();
    } else {
      updates.redeemBy = null;
    }
  }
  updates.updatedAt = new Date().toISOString();

  const { error } = await getSupabaseAdmin()
    .from("CommunityAccessCode")
    .update(updates)
    .eq("id", id)
    .select("id, slug")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (replacementToken) {
    const { data } = await getSupabaseAdmin()
      .from("CommunityAccessCode")
      .select("slug")
      .eq("id", id)
      .maybeSingle();
    const slug = String((data as { slug?: string } | null)?.slug ?? "");
    return NextResponse.json({
      ok: true,
      url: slug ? communityAccessUrl(originFromRequest(request), slug, replacementToken) : null,
    });
  }
  return NextResponse.json({ ok: true });
}
