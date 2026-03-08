import { NextResponse } from "next/server";
import { mergeGrantMemoryFromSnapshot } from "@/lib/grant-memory";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * POST /api/internal/merge-grant-memory
 * Called by the worker when an application's filled_snapshot is updated.
 * Body: { profileId: string; organisationId: string; filledSnapshot: unknown }
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { profileId, organisationId, filledSnapshot } = body;
    if (!profileId || !organisationId || filledSnapshot == null) {
      return NextResponse.json(
        { error: "profileId, organisationId, and filledSnapshot required" },
        { status: 400 }
      );
    }

    await mergeGrantMemoryFromSnapshot(profileId, organisationId, filledSnapshot);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[MERGE_GRANT_MEMORY]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
