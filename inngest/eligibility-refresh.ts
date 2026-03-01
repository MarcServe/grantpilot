import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { matchGrantsToProfile, getEligibilityDecision } from "@/lib/claude";
import { notifyOrgMembers } from "@/lib/notify";

const TOP_N = 25;
const HIGH_FIT_THRESHOLD = 85;
const NOTIFY_COOLDOWN_DAYS = 7;

function profileToMatching(profile: Record<string, unknown>) {
  const get = (key: string) => profile[key] ?? profile[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
  return {
    businessName: String(get("businessName") ?? ""),
    sector: String(get("sector") ?? ""),
    missionStatement: String(get("missionStatement") ?? ""),
    description: String(get("description") ?? ""),
    location: String(get("location") ?? ""),
    employeeCount: profile.employeeCount != null ? Number(profile.employeeCount) : (profile.employee_count != null ? Number(profile.employee_count) : null),
    annualRevenue: profile.annualRevenue != null ? Number(profile.annualRevenue) : (profile.annual_revenue != null ? Number(profile.annual_revenue) : null),
    fundingMin: Number(get("fundingMin") ?? get("funding_min") ?? 0),
    fundingMax: Number(get("fundingMax") ?? get("funding_max") ?? 0),
    fundingPurposes: Array.isArray(profile.fundingPurposes) ? profile.fundingPurposes as string[] : (Array.isArray(profile.funding_purposes) ? profile.funding_purposes as string[] : []),
    fundingDetails: profile.fundingDetails != null ? String(profile.fundingDetails) : (profile.funding_details != null ? String(profile.funding_details) : null),
  };
}

export const eligibilityRefresh = inngest.createFunction(
  { id: "eligibility-refresh", name: "Eligibility cache refresh & high-fit notifications" },
  { cron: "0 3 * * *" },
  async () => {
    const supabase = getSupabaseAdmin();
    const { data: grants = [] } = await supabase.from("Grant").select("id, name, funder, amount, eligibility, sectors, regions");
    if (grants.length === 0) return { refreshed: 0, notified: 0 };

    const { data: profiles = [] } = await supabase
      .from("BusinessProfile")
      .select("*")
      .gte("completionScore", 50);

    const byOrg = new Map<string, (typeof profiles)[number]>();
    for (const p of profiles) {
      const orgId = (p as { organisationId?: string; organisation_id?: string }).organisationId ?? (p as { organisation_id?: string }).organisation_id;
      if (orgId && !byOrg.has(orgId)) byOrg.set(orgId, p);
    }

    let notifiedCount = 0;

    for (const [orgId, profile] of byOrg) {
      try {
        const grantList = grants as { id: string; name: string; funder: string; amount?: number; eligibility: string; sectors: string[]; regions: string[] }[];
        const matches = await matchGrantsToProfile(
          profileToMatching(profile as Record<string, unknown>),
          grantList.map((g) => ({
            id: g.id,
            name: g.name,
            funder: g.funder,
            amount: g.amount ?? null,
            eligibility: g.eligibility,
            sectors: g.sectors ?? [],
            regions: g.regions ?? [],
          }))
        );

        const topGrants = matches
          .slice(0, TOP_N)
          .map((m) => grantList.find((g) => g.id === m.grantId))
          .filter(Boolean) as typeof grantList;

        for (const grant of topGrants) {
          try {
            const result = await getEligibilityDecision(
              profileToMatching(profile as Record<string, unknown>),
              {
                id: grant.id,
                name: grant.name,
                funder: grant.funder,
                amount: grant.amount ?? null,
                eligibility: grant.eligibility,
                sectors: grant.sectors ?? [],
                regions: grant.regions ?? [],
              }
            );
            const score = result.score ?? result.confidence;

            const { error: upsertErr } = await supabase.from("EligibilityAssessment").upsert(
              {
                organisation_id: orgId,
                profile_id: profile.id,
                grant_id: grant.id,
                score,
                decision: result.decision,
                summary: result.summary ?? result.reason,
                reasons: result.reasons ?? [],
                alignment: result.alignment ?? null,
                improvement_plan: result.improvementPlan ?? null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "organisation_id,profile_id,grant_id" }
            );
            if (upsertErr) console.error("[eligibility-refresh] upsert", upsertErr);

            if (score >= HIGH_FIT_THRESHOLD) {
              const cooldown = new Date();
              cooldown.setDate(cooldown.getDate() - NOTIFY_COOLDOWN_DAYS);
              const { data: existing } = await supabase
                .from("EligibilityAssessment")
                .select("notified_at")
                .eq("organisation_id", orgId)
                .eq("profile_id", profile.id)
                .eq("grant_id", grant.id)
                .single();

              const notifiedAt = (existing as { notified_at: string | null } | null)?.notified_at;
              if (!notifiedAt || new Date(notifiedAt) < cooldown) {
                await notifyOrgMembers(orgId, "grant_match_high", {
                  grantName: grant.name,
                  grantId: grant.id,
                  score,
                });
                await supabase
                  .from("EligibilityAssessment")
                  .update({ notified_at: new Date().toISOString() })
                  .eq("organisation_id", orgId)
                  .eq("profile_id", profile.id)
                  .eq("grant_id", grant.id);
                notifiedCount += 1;
              }
            }
          } catch (err) {
            console.error(`[eligibility-refresh] grant ${grant.id} for org ${orgId}:`, err);
          }
        }
      } catch (err) {
        console.error(`[eligibility-refresh] org ${orgId}:`, err);
      }
    }

    return { refreshed: byOrg.size, notified: notifiedCount };
  }
);
