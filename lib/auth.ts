import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const ACTIVE_PROFILE_COOKIE = "grantscopilot_active_profile_id";

type MembershipRow = Record<string, unknown>;
type UserRow = Record<string, unknown>;
export type NormalisedProfile = Record<string, unknown> & {
  id: string;
  completionScore?: number;
  completion_score?: number;
  businessName?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
};
export type NormalisedOrganisation = Record<string, unknown> & {
  id?: string;
  name?: string;
  plan?: string;
  stripeId?: string | null;
  profiles?: NormalisedProfile[];
};
type NormalisedMembership = Record<string, unknown> & {
  userId: string;
  organisationId: string;
  role: string;
  createdAt: string;
  organisation: NormalisedOrganisation;
};
type NormalisedUser = Record<string, unknown> & {
  id?: string;
  email?: string;
  memberships: NormalisedMembership[];
};

function normaliseUserMemberships(userRow: UserRow): NormalisedUser {
  const rawMemberships =
    userRow.OrganisationMember ??
    userRow.organisation_member ??
    [];
  const rawList = Array.isArray(rawMemberships) ? rawMemberships : [];
  const memberships = rawList.map((m: MembershipRow) => {
    const org = (m.Organisation ?? m.organisation) as Record<string, unknown> | undefined;
    const orgAny = org as { BusinessProfile?: unknown[]; business_profile?: unknown[] } | undefined;
    const rawProfiles = orgAny?.BusinessProfile ?? orgAny?.business_profile ?? [];
    const profiles = Array.isArray(rawProfiles) ? rawProfiles as NormalisedProfile[] : [];
    const createdAt = (m.createdAt ?? m.created_at) as string | undefined;
    const orgId = (m.organisationId ?? m.organisation_id ?? org?.id) as string | undefined;
    return {
      ...m,
      userId: (m.userId ?? m.user_id ?? m.user_id) as string,
      organisationId: orgId ?? "",
      role: (m.role as string) ?? "MEMBER",
      createdAt: createdAt ?? new Date().toISOString(),
      organisation: {
        ...org,
        profiles,
      },
    };
  });

  return {
    ...userRow,
    memberships: memberships.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ),
  };
}

function profileCreatedTime(profile: NormalisedProfile): number {
  const raw = profile.createdAt ?? profile.created_at;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function profilesWithActiveFirst(
  profiles: NormalisedProfile[] | undefined,
  activeProfileId: string | null
): { profiles: NormalisedProfile[]; activeProfile: NormalisedProfile | null } {
  const sorted = [...(profiles ?? [])].sort((a, b) => profileCreatedTime(a) - profileCreatedTime(b));
  const activeIndex = activeProfileId ? sorted.findIndex((profile) => profile.id === activeProfileId) : -1;
  if (activeIndex > 0) {
    const [active] = sorted.splice(activeIndex, 1);
    sorted.unshift(active);
  }
  return {
    profiles: sorted,
    activeProfile: sorted[0] ?? null,
  };
}

export async function setActiveProfileCookie(profileId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROFILE_COOKIE, profileId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

async function fetchFullUserBySupabaseId(admin: ReturnType<typeof getSupabaseAdmin>, supabaseId: string) {
  const { data, error } = await admin
    .from("User")
    .select(
      "*, OrganisationMember(*, Organisation(*, BusinessProfile(*)))"
    )
    .eq("supabaseId", supabaseId)
    .maybeSingle();

  if (error) {
    console.error("Fetch user failed:", error);
    return null;
  }
  return data ? normaliseUserMemberships(data as UserRow) : null;
}

async function ensureProvisionedUser(admin: ReturnType<typeof getSupabaseAdmin>, supabaseId: string, email: string): Promise<NormalisedUser | null> {
  const deterministicUserId = `user-${supabaseId}`;
  const { data: newUser, error: userError } = await admin
    .from("User")
    .upsert(
      { id: deterministicUserId, supabaseId, email },
      { onConflict: "supabaseId", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (userError || !newUser) {
    console.error("Create user failed:", userError);
    return null;
  }

  const userId = (newUser as { id: string }).id;
  const existingFullUser = await fetchFullUserBySupabaseId(admin, supabaseId);
  if (existingFullUser?.memberships?.length) {
    return existingFullUser;
  }

  const deterministicOrgId = `org-${userId}`;
  const { data: org, error: orgError } = await admin
    .from("Organisation")
    .upsert(
      {
        id: deterministicOrgId,
        name: email.split("@")[0] || "My Organisation",
        type: "FOUNDER",
      },
      { onConflict: "id", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (orgError || !org) {
    console.error("Create org failed:", orgError);
    return null;
  }

  const orgId = (org as { id: string }).id;
  const { error: memberError } = await admin
    .from("OrganisationMember")
    .upsert(
      {
        id: `member-${userId}-${orgId}`,
        userId,
        organisationId: orgId,
        role: "OWNER",
      },
      { onConflict: "userId,organisationId", ignoreDuplicates: false }
    );

  if (memberError) {
    console.error("Create member failed:", memberError);
    return null;
  }

  return fetchFullUserBySupabaseId(admin, supabaseId);
}

export const getCurrentUser = cache(async function getCurrentUser(): Promise<NormalisedUser | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const admin = getSupabaseAdmin();
  const email = authUser.email ?? "";

  const existingUser = await fetchFullUserBySupabaseId(admin, authUser.id);
  if (existingUser?.memberships?.length) return existingUser;

  return ensureProvisionedUser(admin, authUser.id, email);
});

export const requireUser = cache(async function requireUser(): Promise<NormalisedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
});

/**
 * Returns the user's active organisation (first membership for MVP).
 * In a multi-org future this would read from a cookie/session.
 */
export const getActiveOrg = cache(async function getActiveOrg(): Promise<{
  user: Awaited<ReturnType<typeof requireUser>>;
  org: NormalisedOrganisation;
  profile: NormalisedProfile | null;
  activeProfileId: string | null;
  role: string;
  orgId: string;
}> {
  const user = await requireUser();
  const membership =
    user.memberships.find((m: { role: string }) => m.role === "OWNER" || m.role === "ADMIN") ??
    user.memberships[0];
  if (!membership) {
    throw new Error("No organisation found");
  }
  const m = membership as { organisationId?: string; organisation_id?: string; organisation?: { id?: string } };
  const orgId = (m.organisationId?.trim() && m.organisationId) || (m.organisation_id?.trim() && m.organisation_id) || m.organisation?.id;
  if (!orgId) {
    throw new Error("Organisation ID missing on membership");
  }
  const cookieStore = await cookies();
  const requestedProfileId = cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value ?? null;
  const { profiles, activeProfile } = profilesWithActiveFirst(membership.organisation.profiles, requestedProfileId);
  const org = {
    ...membership.organisation,
    profiles,
  };
  return {
    user,
    org,
    profile: activeProfile,
    activeProfileId: activeProfile?.id ?? null,
    role: membership.role,
    orgId,
  };
});
