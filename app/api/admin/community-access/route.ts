import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  COMMUNITY_ACCESS_DEFAULT_DURATION_DAYS,
  COMMUNITY_ACCESS_DEFAULT_MAX_REDEMPTIONS,
  COMMUNITY_ACCESS_DEFAULT_PLAN,
  communityAccessUrl,
  generateCommunityAccessToken,
  hashCommunityAccessToken,
  normaliseCommunitySlug,
  partnerNameFromSlug,
} from "@/lib/community-access";
import { resolvePlanKey } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

function originFromRequest(request: Request): string {
  const url = new URL(request.url);
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  return configured?.trim() || url.origin;
}

function toPositiveInt(value: unknown, fallback: number, max: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(numberValue)));
}

async function communityAccessPayload() {
  const supabase = getSupabaseAdmin();
  const [{ data: codes, error: codeError }, { data: redemptions, error: redemptionError }] = await Promise.all([
    supabase.from("CommunityAccessCode").select("*").order("createdAt", { ascending: false }),
    supabase.from("CommunityAccessRedemption").select("codeId, accessExpiresAt, redeemedAt"),
  ]);

  if (codeError) {
    return { ok: false as const, error: codeError.message };
  }
  if (redemptionError) {
    return { ok: false as const, error: redemptionError.message };
  }

  const now = Date.now();
  const counts = new Map<string, { redemptions: number; active: number; expired: number }>();
  for (const row of (redemptions ?? []) as Array<Record<string, unknown>>) {
    const codeId = String(row.codeId ?? row.code_id ?? "");
    if (!codeId) continue;
    const current = counts.get(codeId) ?? { redemptions: 0, active: 0, expired: 0 };
    current.redemptions += 1;
    const expiresAt = new Date(String(row.accessExpiresAt ?? row.access_expires_at ?? ""));
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now) current.active += 1;
    else current.expired += 1;
    counts.set(codeId, current);
  }

  return {
    ok: true as const,
    codes: ((codes ?? []) as Array<Record<string, unknown>>).map((code) => {
      const codeId = String(code.id ?? "");
      const maxRedemptions = Number(code.maxRedemptions ?? code.max_redemptions ?? COMMUNITY_ACCESS_DEFAULT_MAX_REDEMPTIONS);
      const count = counts.get(codeId) ?? { redemptions: 0, active: 0, expired: 0 };
      return {
        id: codeId,
        partnerName: String(code.partnerName ?? code.partner_name ?? partnerNameFromSlug(String(code.slug ?? ""))),
        slug: String(code.slug ?? ""),
        accessPlan: String(code.accessPlan ?? code.access_plan ?? COMMUNITY_ACCESS_DEFAULT_PLAN),
        durationDays: Number(code.durationDays ?? code.duration_days ?? COMMUNITY_ACCESS_DEFAULT_DURATION_DAYS),
        maxRedemptions,
        redeemBy: (code.redeemBy ?? code.redeem_by ?? null) as string | null,
        active: code.active !== false,
        createdAt: (code.createdAt ?? code.created_at ?? null) as string | null,
        updatedAt: (code.updatedAt ?? code.updated_at ?? null) as string | null,
        redemptions: count.redemptions,
        activeMembers: count.active,
        expiredMembers: count.expired,
        remaining: Math.max(0, maxRedemptions - count.redemptions),
      };
    }),
  };
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const payload = await communityAccessPayload();
  if (!payload.ok) {
    return NextResponse.json({ error: payload.error }, { status: 500 });
  }
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const partnerNameInput = String(body.partnerName ?? "").trim();
  const slug = normaliseCommunitySlug(String(body.slug ?? partnerNameInput));
  if (!slug) {
    return NextResponse.json({ error: "Partner name or community slug is required" }, { status: 400 });
  }

  const partnerName = partnerNameInput || partnerNameFromSlug(slug);
  const accessPlan = resolvePlanKey(body.accessPlan ?? COMMUNITY_ACCESS_DEFAULT_PLAN);
  const durationDays = toPositiveInt(body.durationDays, COMMUNITY_ACCESS_DEFAULT_DURATION_DAYS, 365);
  const maxRedemptions = toPositiveInt(body.maxRedemptions, COMMUNITY_ACCESS_DEFAULT_MAX_REDEMPTIONS, 10000);
  const redeemByRaw = typeof body.redeemBy === "string" ? body.redeemBy.trim() : "";
  const redeemBy = redeemByRaw ? new Date(redeemByRaw) : null;
  if (redeemBy && Number.isNaN(redeemBy.getTime())) {
    return NextResponse.json({ error: "Redeem-by date is invalid" }, { status: 400 });
  }

  const token = generateCommunityAccessToken();
  const currentUser = await getCurrentUser();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("CommunityAccessCode")
    .insert({
      partnerName,
      slug,
      tokenHash: hashCommunityAccessToken(token),
      accessPlan,
      durationDays,
      maxRedemptions,
      redeemBy: redeemBy ? redeemBy.toISOString() : null,
      active: body.active !== false,
      createdBy: currentUser?.email ?? null,
    })
    .select("*")
    .single();

  if (error) {
    const message = error.message.includes("duplicate")
      ? "A community code with this slug already exists. Deactivate it or choose a new slug."
      : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const payload = await communityAccessPayload();
  return NextResponse.json({
    ok: true,
    created: data,
    url: communityAccessUrl(originFromRequest(request), slug, token),
    codes: payload.ok ? payload.codes : [],
  });
}
