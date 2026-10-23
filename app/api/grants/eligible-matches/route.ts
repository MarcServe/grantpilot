import { loadMatchBatch } from "@/lib/profile-match-batch";
import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getProfileMatchWindow } from "@/lib/profile-matches";
import { normalizeEligibleMatchSection } from "@/lib/eligible-match-rules";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tier = normalizeEligibleMatchSection(url.searchParams.get("tier"));
    const rawPage = Number(url.searchParams.get("page"));
    const page = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1;
    const size = Number(url.searchParams.get("pageSize"));
    const pageSize = [5, 20, 30, 50].includes(size) ? size : 20;
    const { org, orgId, activeProfileId } = await getActiveOrg();
    const profileId = activeProfileId ?? org.profiles?.[0]?.id;
    if (!profileId)
      return NextResponse.json({ error: "Profile required" }, { status: 400 });
    if (url.searchParams.get("profileId") && url.searchParams.get("profileId") !== profileId) {
      return NextResponse.json({ error: "Active business changed. Refresh to load its opportunities." }, { status: 409 });
    }
    let result;
    try {
      result = await loadMatchBatch(tier, pageSize, url.searchParams.get("cursor"), (offset) => getProfileMatchWindow(orgId, profileId, offset));
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid batch cursor") return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }
    const { grants, hasMore, nextCursor } = result;
    return NextResponse.json({ grants, page, pageSize, tier, hasMore,
      nextCursor,
      availableCandidateCount: grants.length,
      availableCandidateCountIsEstimate: hasMore,
      returnedCount: grants.length,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === "Unauthorized"
            ? "Unauthorized"
            : "Unable to load matches",
      },
      {
        status:
          error instanceof Error && error.message === "Unauthorized"
            ? 401
            : 500,
      },
    );
  }
}
