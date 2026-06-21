import { NextResponse } from "next/server";

import { isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { getAdminEligibilityWhatsAppTraces } from "@/lib/eligibility-notification-diagnostics";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isAdmin())) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { response: null };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  try {
    const traces = await getAdminEligibilityWhatsAppTraces({ days: 1, limit: 8 });
    return NextResponse.json({ traces });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load WhatsApp diagnostics." },
      { status: 500 }
    );
  }
}
