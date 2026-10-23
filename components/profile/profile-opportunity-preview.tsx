import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";

/** Small preview only: never start AI scoring or scan the portfolio in the header. */
export async function ProfileOpportunityPreview({ orgId, profile }: {
  orgId: string; profile: Record<string, unknown>;
}) {
  try {
    const db = getSupabaseAdmin({ timeoutMs: 5000 });
    const profileId = String(profile.id ?? "");
    const assessment = profileId ? await db.from("EligibilityAssessment")
      .select("grant_id").eq("organisation_id", orgId).eq("profile_id", profileId)
      .gte("score", 50).order("score", { ascending: false }).limit(12) : null;
    const ids = (assessment?.data ?? []).map(row => row.grant_id);
    let query = db.from("Grant")
      .select("id, name, funder, deadline, url_status, funderLocations, createdAt")
      .order("createdAt", { ascending: false }).limit(12);
    if (ids.length) query = query.in("id", ids);
    const result = await query;
    const locations = inferFunderLocationsFromProfile(profile);
    const grants = (result.data ?? []).filter(grant => isGrantActionableNow(grant) &&
      grantMatchesFunderLocations(grant.funderLocations, locations)).slice(0, 3);
    if (!grants.length) return null;
    return <section className="mt-5 border-t border-blue-100 pt-4" aria-label="Potential grant opportunities">
      <h3 className="font-bold text-[#071a3a]">{ids.length ? "Your business may be a fit for opportunities like these" : "Recent opportunities to explore"}</h3>
      <p className="mt-1 text-xs text-slate-600">Potential opportunities, not confirmed eligibility. Complete your Business DNA so we can check the requirements against your business.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">{grants.map(grant => <Link key={grant.id} href={`/grants/${encodeURIComponent(grant.id)}?from=profile-preview`} className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 transition-colors hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-600">
        <span className="block text-sm font-semibold text-[#071a3a]">{grant.name}</span>
        <span className="mt-1 block text-xs text-slate-600">{grant.funder}</span>
        <span className="mt-2 block text-xs font-bold text-blue-700">Review opportunity →</span>
      </Link>)}</div>
    </section>;
  } catch {
    // The optional preview must never prevent profile completion or page access.
    return null;
  }
}
