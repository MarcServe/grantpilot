import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  GRANT_INTELLIGENCE_BATCH_SIZE,
  enqueueGrantsForIntelligence,
  processGrantIntelligenceQueue,
} from "@/lib/grant-intelligence-queue";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isAdmin())) {
    return { user: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, response: null };
}

const BodySchema = z.object({
  action: z.enum(["enqueue", "process"]),
  limit: z.number().int().positive().max(1000).optional(),
});

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (parsed.data.action === "enqueue") {
    const result = await enqueueGrantsForIntelligence({
      supabase,
      limit: parsed.data.limit ?? 500,
      source: "admin.grant_intelligence",
    });
    return NextResponse.json(result);
  }

  const result = await processGrantIntelligenceQueue({
    supabase,
    limit: parsed.data.limit ?? GRANT_INTELLIGENCE_BATCH_SIZE,
  });
  return NextResponse.json(result);
}
