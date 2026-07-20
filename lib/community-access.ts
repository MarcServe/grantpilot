import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanKey } from "./plans";
import { resolveEffectivePlanForOrg, resolvePlanKey, type PlanAccessSource } from "./plan-features";
import {
  COMMUNITY_ACCESS_DEFAULT_DURATION_DAYS,
  COMMUNITY_ACCESS_DEFAULT_MAX_REDEMPTIONS,
  COMMUNITY_ACCESS_DEFAULT_PLAN,
  communityAccessUnlocksText,
  formatCommunityAccessExpiry,
  normaliseCommunitySlug,
  partnerNameFromSlug,
} from "./community-access-shared";

export {
  COMMUNITY_ACCESS_DEFAULT_DURATION_DAYS,
  COMMUNITY_ACCESS_DEFAULT_MAX_REDEMPTIONS,
  COMMUNITY_ACCESS_DEFAULT_PLAN,
  communityAccessUnlocksText,
  formatCommunityAccessExpiry,
  normaliseCommunitySlug,
  partnerNameFromSlug,
};

export type CommunityAccessCodeRow = {
  id: string;
  partnerName?: string | null;
  partner_name?: string | null;
  slug: string;
  tokenHash?: string | null;
  token_hash?: string | null;
  accessPlan?: string | null;
  access_plan?: string | null;
  durationDays?: number | null;
  duration_days?: number | null;
  maxRedemptions?: number | null;
  max_redemptions?: number | null;
  redeemBy?: string | null;
  redeem_by?: string | null;
  active?: boolean | null;
  createdBy?: string | null;
  created_by?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
};

export type CommunityAccessRedemptionRow = {
  id: string;
  codeId?: string | null;
  code_id?: string | null;
  userId?: string | null;
  user_id?: string | null;
  organisationId?: string | null;
  organisation_id?: string | null;
  email?: string | null;
  accessPlan?: string | null;
  access_plan?: string | null;
  accessExpiresAt?: string | null;
  access_expires_at?: string | null;
  redeemedAt?: string | null;
  redeemed_at?: string | null;
};

export type CommunityAccessClaimResult =
  | {
      ok: true;
      code: CommunityAccessCodeRow;
      accessPlan: PlanKey;
      accessExpiresAt: string;
      alreadyRedeemed: boolean;
      effectivePlan: PlanKey;
    }
  | {
      ok: false;
      reason: "missing_code" | "invalid_code" | "inactive" | "expired" | "capacity_full" | "missing_user" | "missing_org";
      message: string;
    };

export type CommunityAccessValidationError = Extract<CommunityAccessClaimResult, { ok: false }>;

type SupabaseLike = Pick<SupabaseClient, "from">;

function codeValue<T>(row: CommunityAccessCodeRow, camel: keyof CommunityAccessCodeRow, snake: keyof CommunityAccessCodeRow): T | null {
  return (row[camel] ?? row[snake] ?? null) as T | null;
}

function redemptionValue<T>(
  row: CommunityAccessRedemptionRow,
  camel: keyof CommunityAccessRedemptionRow,
  snake: keyof CommunityAccessRedemptionRow
): T | null {
  return (row[camel] ?? row[snake] ?? null) as T | null;
}

export function generateCommunityAccessToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashCommunityAccessToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

export function communityAccessUrl(origin: string, slug: string, token: string): string {
  const url = new URL(`/community/${normaliseCommunitySlug(slug)}`, origin);
  url.searchParams.set("code", token);
  return url.toString();
}

function communityCodeIsExpired(code: CommunityAccessCodeRow, now = new Date()): boolean {
  const redeemBy = codeValue<string>(code, "redeemBy", "redeem_by");
  if (!redeemBy) return false;
  const date = new Date(redeemBy);
  return Number.isNaN(date.getTime()) ? false : date.getTime() < now.getTime();
}

function readCodePlan(code: CommunityAccessCodeRow): PlanKey {
  return resolvePlanKey(codeValue<string>(code, "accessPlan", "access_plan") ?? COMMUNITY_ACCESS_DEFAULT_PLAN);
}

function readDurationDays(code: CommunityAccessCodeRow): number {
  const raw = codeValue<number>(code, "durationDays", "duration_days");
  return Number.isFinite(raw) && raw ? Math.max(1, Math.min(365, Math.floor(raw))) : COMMUNITY_ACCESS_DEFAULT_DURATION_DAYS;
}

function readMaxRedemptions(code: CommunityAccessCodeRow): number {
  const raw = codeValue<number>(code, "maxRedemptions", "max_redemptions");
  return Number.isFinite(raw) && raw ? Math.max(1, Math.floor(raw)) : COMMUNITY_ACCESS_DEFAULT_MAX_REDEMPTIONS;
}

export async function findCommunityAccessCodeByToken(
  supabase: SupabaseLike,
  slug: string,
  token: string | null | undefined
): Promise<CommunityAccessCodeRow | null> {
  if (!token?.trim()) return null;
  const normalisedSlug = normaliseCommunitySlug(slug);
  if (!normalisedSlug) return null;
  const tokenHash = hashCommunityAccessToken(token);
  const { data, error } = await supabase
    .from("CommunityAccessCode")
    .select("*")
    .eq("slug", normalisedSlug)
    .eq("tokenHash", tokenHash)
    .maybeSingle();
  if (error) {
    console.error("[community_access] code lookup failed", { slug: normalisedSlug, error: error.message });
    return null;
  }
  return (data as CommunityAccessCodeRow | null) ?? null;
}

export function validateCommunityAccessCode(code: CommunityAccessCodeRow | null, now = new Date()): CommunityAccessValidationError | null {
  if (!code) {
    return { ok: false, reason: "invalid_code", message: "This community access link is invalid." };
  }
  if (code.active === false) {
    return { ok: false, reason: "inactive", message: "This community access link is no longer active." };
  }
  if (communityCodeIsExpired(code, now)) {
    return { ok: false, reason: "expired", message: "This community access link has expired." };
  }
  return null;
}

export async function redeemCommunityAccessForOrg({
  supabase,
  code,
  userId,
  organisationId,
  email,
  now = new Date(),
}: {
  supabase: SupabaseLike;
  code: CommunityAccessCodeRow;
  userId: string | null | undefined;
  organisationId: string | null | undefined;
  email: string | null | undefined;
  now?: Date;
}): Promise<CommunityAccessClaimResult> {
  if (!userId) return { ok: false, reason: "missing_user", message: "Sign in before claiming this community access link." };
  if (!organisationId) return { ok: false, reason: "missing_org", message: "No active organisation was found for this account." };

  const invalid = validateCommunityAccessCode(code, now);
  if (invalid) return invalid;

  const codeId = code.id;
  const existingResult = await supabase
    .from("CommunityAccessRedemption")
    .select("*")
    .eq("codeId", codeId)
    .or(`organisationId.eq.${organisationId},userId.eq.${userId}`)
    .limit(1);
  const existing = (existingResult.data?.[0] as CommunityAccessRedemptionRow | undefined) ?? null;
  if (existingResult.error) {
    console.error("[community_access] redemption lookup failed", {
      codeId,
      organisationId,
      error: existingResult.error.message,
    });
  }

  const accessPlan = readCodePlan(code);
  const existingExpiry = existing ? redemptionValue<string>(existing, "accessExpiresAt", "access_expires_at") : null;
  const accessExpiresAt = existingExpiry
    ? new Date(existingExpiry)
    : new Date(now.getTime() + readDurationDays(code) * 86_400_000);
  const accessExpiresAtIso = accessExpiresAt.toISOString();

  if (!existing) {
    const { count, error: countError } = await supabase
      .from("CommunityAccessRedemption")
      .select("id", { count: "exact", head: true })
      .eq("codeId", codeId);
    if (countError) {
      console.error("[community_access] redemption count failed", { codeId, error: countError.message });
    }
    if ((count ?? 0) >= readMaxRedemptions(code)) {
      return { ok: false, reason: "capacity_full", message: "This community access link has reached its redemption limit." };
    }

    const { error: insertError } = await supabase
      .from("CommunityAccessRedemption")
      .insert({
        codeId,
        userId,
        organisationId,
        email: email ?? "",
        accessPlan,
        accessExpiresAt: accessExpiresAtIso,
      });
    if (insertError) {
      const repeat = await supabase
        .from("CommunityAccessRedemption")
        .select("*")
        .eq("codeId", codeId)
        .or(`organisationId.eq.${organisationId},userId.eq.${userId}`)
        .limit(1);
      if (!repeat.data?.[0]) {
        console.error("[community_access] redemption insert failed", {
          codeId,
          organisationId,
          error: insertError.message,
        });
        return { ok: false, reason: "invalid_code", message: "Could not claim this community access link." };
      }
    }
  }

  const slug = normaliseCommunitySlug(code.slug);
  const { data: updatedOrg, error: updateError } = await supabase
    .from("Organisation")
    .update({
      communityAccessPlan: accessPlan,
      communityAccessExpiresAt: accessExpiresAtIso,
      communityPartnerSlug: slug,
      communityAccessCodeId: codeId,
    })
    .eq("id", organisationId)
    .select("plan, createdAt, communityAccessPlan, communityAccessExpiresAt")
    .maybeSingle();
  if (updateError) {
    console.error("[community_access] organisation update failed", {
      codeId,
      organisationId,
      error: updateError.message,
    });
    return { ok: false, reason: "invalid_code", message: "Could not apply community access to this organisation." };
  }

  return {
    ok: true,
    code,
    accessPlan,
    accessExpiresAt: accessExpiresAtIso,
    alreadyRedeemed: Boolean(existing),
    effectivePlan: resolveEffectivePlanForOrg((updatedOrg as PlanAccessSource | null) ?? {
      plan: "FREE_TRIAL",
      communityAccessPlan: accessPlan,
      communityAccessExpiresAt: accessExpiresAtIso,
    }),
  };
}
