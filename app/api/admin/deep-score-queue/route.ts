import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import {
  DEEP_SCORE_BATCH_SIZE,
  enqueueExistingHeuristicAssessments,
  processEligibilityDeepScoreQueue,
} from "@/lib/eligibility-deep-score-queue";

const actionSchema = z.object({
  action: z.enum(["enqueue_backlog", "process_batch"]),
  limit: z.number().int().min(1).max(1000).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  organisationId: z.string().trim().min(1).optional(),
  profileId: z.string().trim().min(1).optional(),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isAdmin())) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let parsed: z.infer<typeof actionSchema>;
  try {
    const body = await request.json();
    const result = actionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid action" }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (parsed.action === "enqueue_backlog") {
      const result = await enqueueExistingHeuristicAssessments({
        limit: parsed.limit ?? 500,
        minScore: parsed.minScore ?? 40,
      });
      return NextResponse.json({ ok: true, result });
    }

    const result = await processEligibilityDeepScoreQueue({
      limit: parsed.limit ?? DEEP_SCORE_BATCH_SIZE,
      organisationId: parsed.organisationId,
      profileId: parsed.profileId,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Deep-score queue action failed." },
      { status: 500 }
    );
  }
}
