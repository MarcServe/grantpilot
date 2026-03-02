import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const admin = getSupabaseAdmin();
  const email = authUser.email ?? "";

  const { data: userRow, error: userError } = await admin
    .from("User")
    .select(
      "*, OrganisationMember(Organisation(*, BusinessProfile(*)))"
    )
    .eq("supabaseId", authUser.id)
    .single();

  if (!userError && userRow) {
    const rawMemberships =
      (userRow as Record<string, unknown>).OrganisationMember ??
      (userRow as Record<string, unknown>).organisation_member ??
      [];
    const rawList = Array.isArray(rawMemberships) ? rawMemberships : [];
    const memberships = rawList.map((m: Record<string, unknown>) => {
      const org = (m.Organisation ?? m.organisation) as Record<string, unknown> | undefined;
      const orgAny = org as { BusinessProfile?: unknown[]; business_profile?: unknown[] } | undefined;
      const profiles = orgAny?.BusinessProfile ?? orgAny?.business_profile ?? [];
      const createdAt = (m.createdAt ?? m.created_at) as string | undefined;
      const orgId = (m.organisationId ?? m.organisation_id ?? org?.id) as string | undefined;
      return {
        ...m,
        userId: (m.userId ?? m.user_id ?? (m as Record<string, unknown>).user_id) as string,
        organisationId: orgId ?? "",
        role: (m.role as string) ?? "MEMBER",
        createdAt: createdAt ?? new Date().toISOString(),
        organisation: {
          ...org,
          profiles: Array.isArray(profiles) ? profiles : [],
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

  const { data: newUser, error: createUserError } = await admin
    .from("User")
    .insert({ supabaseId: authUser.id, email })
    .select("id")
    .single();

  if (createUserError || !newUser) {
    console.error("Create user failed:", createUserError);
    return null;
  }

  const { data: org, error: createOrgError } = await admin
    .from("Organisation")
    .insert({
      name: email.split("@")[0] || "My Organisation",
      type: "FOUNDER",
    })
    .select("id")
    .single();

  if (createOrgError || !org) {
    console.error("Create org failed:", createOrgError);
    return null;
  }

  const { error: createMemberError } = await admin
    .from("OrganisationMember")
    .insert({
      userId: newUser.id,
      organisationId: org.id,
      role: "OWNER",
    });

  if (createMemberError) {
    console.error("Create member failed:", createMemberError);
    return null;
  }

  const { data: fullUser, error: fetchError } = await admin
    .from("User")
    .select(
      "*, OrganisationMember(Organisation(*, BusinessProfile(*)))"
    )
    .eq("id", newUser.id)
    .single();

  if (fetchError || !fullUser) {
    console.error("Fetch user after create failed:", fetchError);
    return null;
  }

  const rawMemberships =
    (fullUser as Record<string, unknown>).OrganisationMember ??
    (fullUser as Record<string, unknown>).organisation_member ??
    [];
  const rawList = Array.isArray(rawMemberships) ? rawMemberships : [];
  const memberships = rawList.map((m: Record<string, unknown>) => {
    const org = (m.Organisation ?? m.organisation) as Record<string, unknown> | undefined;
    const orgAny = org as { BusinessProfile?: unknown[]; business_profile?: unknown[] } | undefined;
    const profiles = orgAny?.BusinessProfile ?? orgAny?.business_profile ?? [];
    const createdAt = (m.createdAt ?? m.created_at) as string | undefined;
    const orgId = (m.organisationId ?? m.organisation_id ?? org?.id) as string | undefined;
    return {
      ...m,
      userId: (m.userId ?? m.user_id ?? (m as Record<string, unknown>).user_id) as string,
      organisationId: orgId ?? "",
      role: (m.role as string) ?? "MEMBER",
      createdAt: createdAt ?? new Date().toISOString(),
      organisation: {
        ...org,
        profiles: Array.isArray(profiles) ? profiles : [],
      },
    };
  });

  return {
    ...fullUser,
    memberships: memberships.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ),
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

/**
 * Returns the user's active organisation (first membership for MVP).
 * In a multi-org future this would read from a cookie/session.
 */
export async function getActiveOrg() {
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
  return {
    user,
    org: membership.organisation,
    role: membership.role,
    orgId,
  };
}
