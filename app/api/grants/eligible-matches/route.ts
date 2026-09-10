import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getProfileMatches, pageProfileMatches } from "@/lib/profile-matches";
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
    const matches = await getProfileMatches(orgId, profileId);
    const all = matches.sections[tier];
    const { grants } = pageProfileMatches(matches, tier, page, pageSize);
    return NextResponse.json(
      {
        grants,
        page,
        pageSize,
        tier,
        hasMore: all.length > page * pageSize,
        availableCandidateCount: all.length,
        availableCandidateCountIsEstimate: false,
        rawCandidateCount: all.length,
        returnedCount: grants.length,
        counts: matches.counts,
        version: matches.version,
        missingFacts: matches.missingFacts,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
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
