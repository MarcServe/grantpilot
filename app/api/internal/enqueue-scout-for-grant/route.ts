import { NextResponse } from "next/server";
import { enqueueGrantForScout } from "@/lib/enqueue-scout";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * POST /api/internal/enqueue-scout-for-grant
 * Called by the worker when open_grant_url hits page_not_found or competition_list.
 * Enqueues the grant for Scout so the worker can try to resolve the direct form URL (or re-try after user fixes URL).
 * Body: { grantId: string }
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { grantId } = body;
    if (!grantId || typeof grantId !== "string") {
      return NextResponse.json({ error: "grantId required" }, { status: 400 });
    }

    const enqueued = await enqueueGrantForScout(grantId);
    return NextResponse.json({ enqueued });
  } catch (e) {
    console.error("[enqueue-scout-for-grant]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
