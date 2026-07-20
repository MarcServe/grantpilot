import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  findCommunityAccessCodeByToken,
  normaliseCommunitySlug,
  redeemCommunityAccessForOrg,
} from "@/lib/community-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const slug = normaliseCommunitySlug(url.searchParams.get("community") ?? url.searchParams.get("slug") ?? "");
  const token = url.searchParams.get("code")?.trim() ?? "";

  if (!slug || !token) {
    return NextResponse.redirect(`${origin}/sign-up`);
  }

  let activeOrg: Awaited<ReturnType<typeof getActiveOrg>>;
  try {
    activeOrg = await getActiveOrg();
  } catch {
    const redirectPath = `/community/claim?community=${encodeURIComponent(slug)}&code=${encodeURIComponent(token)}`;
    return NextResponse.redirect(`${origin}/sign-in?redirect=${encodeURIComponent(redirectPath)}`);
  }

  const supabase = getSupabaseAdmin();
  const code = await findCommunityAccessCodeByToken(supabase, slug, token);
  if (!code) {
    return NextResponse.redirect(`${origin}/community/${encodeURIComponent(slug)}?error=claim_failed`);
  }

  const result = await redeemCommunityAccessForOrg({
    supabase,
    code,
    userId: activeOrg.user.id,
    organisationId: activeOrg.orgId,
    email: activeOrg.user.email,
  });

  if (!result.ok) {
    const errorUrl = new URL(`/community/${slug}`, origin);
    errorUrl.searchParams.set("code", token);
    errorUrl.searchParams.set("error", result.reason);
    return NextResponse.redirect(errorUrl.toString());
  }

  return NextResponse.redirect(`${origin}/profile?community=claimed`);
}
