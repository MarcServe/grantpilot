import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  let user = await prisma.user.findUnique({
    where: { supabaseId: authUser.id },
    include: {
      memberships: {
        include: {
          organisation: { include: { profiles: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) {
    const email = authUser.email ?? "";
    user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { supabaseId: authUser!.id, email },
      });

      const org = await tx.organisation.create({
        data: {
          name: email.split("@")[0] || "My Organisation",
          type: "FOUNDER",
        },
      });

      await tx.organisationMember.create({
        data: {
          userId: newUser.id,
          organisationId: org.id,
          role: "OWNER",
        },
      });

      return tx.user.findUniqueOrThrow({
        where: { id: newUser.id },
        include: {
          memberships: {
            include: {
              organisation: { include: { profiles: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    });
  }

  return user;
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
  const membership = user.memberships[0];
  if (!membership) {
    throw new Error("No organisation found");
  }
  return {
    user,
    org: membership.organisation,
    role: membership.role,
    orgId: membership.organisationId,
  };
}
