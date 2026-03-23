import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { matchGrantsToProfile, getEligibilityDecision } from "@/lib/claude";
import { notifyOrgMembers } from "@/lib/notify";
import { grantMatchesFunderLocations } from "@/lib/constants";
import { createStartApplicationToken } from "@/lib/start-application-token";
import { checkRequirementsAgainstDocuments } from "@/lib/grant-requirements";
import type { DigestGrantItem } from "@/lib/notify";
import type { RequiredAttachment } from "@/lib/grant-requirements";
import { getEligibilityNotifyMinCompletion } from "@/lib/eligibility-notify-config";

const TOP_N = 25;
/** Default minimum grant match score to include in digest lists (0 = full range per org prefs). */
const DIGEST_SCORE_THRESHOLD = 0;
const NOTIFY_COOLDOWN_DAYS = 7;

function scoreToDecision(score: number): "likely_eligible" | "review" | "unlikely" {
  if (score >= 70) return "likely_eligible";
  if (score >= 40) return "review";
  return "unlikely";
}

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

function getProfileOrgId(p: { organisationId?: string; organisation_id?: string }): string | null {
  const orgId = p.organisationId ?? p.organisation_id;
  return orgId && String(orgId).trim() ? String(orgId) : null;
}

function getProfileCompletionScore(profile: Record<string, unknown>): number {
  const raw =
    profile.completionScore ??
    profile.completion_score;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

export async function runEligibilityRefreshJob(): Promise<{
  totalGrants: number;
  orgsWithProfile: number;
  profilesProcessed: number;
  notified: number;
  refreshed: number;
}> {
    const supabase = getSupabaseAdmin();
    const { data: grantsData } = await supabase.from("Grant").select("id, name, funder, amount, eligibility, description, objectives, applicantTypes, sectors, regions, funderLocations, required_attachments");
    const allGrants = grantsData ?? [];
    const diagnostics = {
      totalGrants: allGrants.length,
      orgsWithProfile: 0,
      profilesProcessed: 0,
      notified: 0,
      refreshed: 0,
    };
    if (allGrants.length === 0) {
      console.info("[eligibility-refresh] No grants in DB", diagnostics);
      return { ...diagnostics };
    }

    const { data: profilesData } = await supabase
      .from("BusinessProfile")
      .select("*");
    const profiles = profilesData ?? [];

    const minCompletionForNotifications = getEligibilityNotifyMinCompletion();

    /** Every org-linked profile is processed so multi-profile orgs each get scores; notifications need min completion. */
    const profilesWithOrg = profiles.filter((p) => getProfileOrgId(p as { organisationId?: string; organisation_id?: string }) != null);
    const uniqueOrgs = new Set(
      profilesWithOrg.map((p) => getProfileOrgId(p as { organisationId?: string; organisation_id?: string })!)
    );
    diagnostics.orgsWithProfile = uniqueOrgs.size;
    diagnostics.profilesProcessed = profilesWithOrg.length;

    if (profilesWithOrg.length === 0) {
      console.info("[eligibility-refresh] No BusinessProfile rows linked to an organisation", diagnostics);
      return { ...diagnostics };
    }

    let notifiedCount = 0;

    type GrantRow = { id: string; name: string; funder: string; amount?: number; eligibility: string; description?: string; objectives?: string; applicantTypes?: string[]; sectors: string[]; regions: string[]; funderLocations?: string[]; required_attachments?: unknown };
    const grantsList = allGrants as GrantRow[];

    for (const profile of profilesWithOrg) {
      const orgId = getProfileOrgId(profile as { organisationId?: string; organisation_id?: string })!;
      const profileId = (profile as { id?: string }).id ?? "unknown";
      try {
        const completionScore = getProfileCompletionScore(profile as Record<string, unknown>);
        const profileName = (profile as { businessName?: string }).businessName ?? profileId;
        console.info(`[eligibility-refresh] Processing org=${orgId} profile=${profileId} "${profileName}" completion=${completionScore}%`);

        const userFunderLocations = (profile as { funderLocations?: string[] }).funderLocations;
        const grantList = grantsList.filter((g) => grantMatchesFunderLocations(g.funderLocations, userFunderLocations));
        console.info(`[eligibility-refresh]   ${grantList.length} grants match funder locations (of ${grantsList.length} total)`);

        if (grantList.length === 0) {
          console.info(`[eligibility-refresh]   Skipping: no grants match user funderLocations=${JSON.stringify(userFunderLocations ?? [])}`);
          continue;
        }

        let matches: Awaited<ReturnType<typeof matchGrantsToProfile>>;
        try {
          matches = await matchGrantsToProfile(
            profileToMatching(profile as Record<string, unknown>),
            grantList.map((g) => ({
              id: g.id,
              name: g.name,
              funder: g.funder,
              amount: g.amount ?? null,
              eligibility: g.eligibility,
              description: g.description ?? null,
              objectives: g.objectives ?? null,
              applicantTypes: g.applicantTypes ?? [],
              sectors: g.sectors ?? [],
              regions: g.regions ?? [],
            }))
          );
        } catch (matchErr) {
          const errMsg = matchErr instanceof Error ? matchErr.message : String(matchErr);
          console.error(`[eligibility-refresh]   matchGrantsToProfile FAILED for org=${orgId}: ${errMsg.slice(0, 200)}`);
          if (/credit balance/i.test(errMsg)) {
            console.error(`[eligibility-refresh]   Anthropic API credits exhausted — skipping remaining profiles`);
            break;
          }
          continue;
        }

        console.info(`[eligibility-refresh]   matchGrantsToProfile returned ${matches.length} matches`);
        if (matches.length > 0) {
          const topScores = matches.slice(0, 5).map((m) => `${m.grantId?.slice(0, 12)}:${m.score}`);
          console.info(`[eligibility-refresh]   Top scores: ${topScores.join(", ")}`);
        }

        const topGrants = matches
          .slice(0, TOP_N)
          .map((m) => grantList.find((g) => g.id === m.grantId))
          .filter(Boolean) as typeof grantList;

        const { data: prefs } = await supabase
          .from("EligibilityNotificationPreference")
          .select("min_score, max_score, eligible_threshold, notify_email, notify_in_app, notify_whatsapp")
          .eq("organisation_id", orgId)
          .maybeSingle();
        const minScore = (prefs as { min_score?: number } | null)?.min_score ?? DIGEST_SCORE_THRESHOLD;
        const maxScore = (prefs as { max_score?: number } | null)?.max_score ?? 100;
        const eligibleThreshold = (prefs as { eligible_threshold?: number } | null)?.eligible_threshold ?? 70;
        const sendWhatsApp = (prefs as { notify_whatsapp?: boolean } | null)?.notify_whatsapp ?? false;
        const sendNotifyEmail = (prefs as { notify_email?: boolean } | null)?.notify_email !== false;

        const cooldown = new Date();
        cooldown.setDate(cooldown.getDate() - NOTIFY_COOLDOWN_DAYS);
        const digestGrants: DigestGrantItem[] = [];

        const { data: profileDocsData } = await supabase
          .from("Document")
          .select("name, type, category")
          .eq("profileId", profile.id);
        const profileDocsAlt = !profileDocsData?.length
          ? await supabase.from("Document").select("name, type, category").eq("profile_id", profile.id)
          : { data: profileDocsData };
        const profileDocuments = (profileDocsAlt.data ?? []).map((d: { name: string; type?: string; category?: string }) => ({
          name: d.name,
          type: d.type ?? "",
          category: d.category ?? null,
        }));

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
                description: grant.description ?? null,
                objectives: grant.objectives ?? null,
                applicantTypes: grant.applicantTypes ?? [],
                sectors: grant.sectors ?? [],
                regions: grant.regions ?? [],
              }
            );
            const score = result.score ?? result.confidence;
            const summary = result.summary ?? result.reason ?? undefined;

            const { error: upsertErr } = await supabase.from("EligibilityAssessment").upsert(
              {
                organisation_id: orgId,
                profile_id: profile.id,
                grant_id: grant.id,
                score,
                decision: result.decision,
                summary,
                reasons: result.reasons ?? [],
                alignment: result.alignment ?? null,
                improvement_plan: result.improvementPlan ?? null,
                met_criteria: result.met ?? [],
                missing_criteria: result.missing ?? [],
                updated_at: new Date().toISOString(),
              },
              { onConflict: "organisation_id,profile_id,grant_id" }
            );
            if (upsertErr) console.error("[eligibility-refresh] upsert", upsertErr);

            const inRange = score >= minScore && score <= maxScore;

            if (inRange) {
              const { data: existing } = await supabase
                .from("EligibilityAssessment")
                .select("notified_at")
                .eq("organisation_id", orgId)
                .eq("profile_id", profile.id)
                .eq("grant_id", grant.id)
                .single();

              const notifiedAt = (existing as { notified_at: string | null } | null)?.notified_at;
              const includeInDigest = !notifiedAt || new Date(notifiedAt) < cooldown;
              if (includeInDigest) {
                const startApplicationToken = createStartApplicationToken({
                  grantId: grant.id,
                  profileId: profile.id,
                  organisationId: orgId,
                });
                const rawRequired = (grant as { required_attachments?: unknown }).required_attachments;
                const required = (Array.isArray(rawRequired) ? rawRequired : []) as RequiredAttachment[];
                const { missing } = checkRequirementsAgainstDocuments(required, profileDocuments);
                digestGrants.push({
                  grantId: grant.id,
                  grantName: grant.name,
                  score,
                  summary,
                  startApplicationToken,
                  missingDocuments: missing.length > 0 ? missing.map((r) => r.label) : undefined,
                  improvementPlan: result.improvementPlan ?? undefined,
                  missingCriteria: result.missing ?? undefined,
                });
              }
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[eligibility-refresh]   grant ${grant.id} for org ${orgId} profile ${profileId}: ${errMsg.slice(0, 200)}`);
            if (/credit balance/i.test(errMsg)) {
              console.error(`[eligibility-refresh]   Anthropic credits exhausted — stopping grant scoring for this profile`);
              break;
            }
          }
        }

        console.info(`[eligibility-refresh]   Digest candidates: ${digestGrants.length} grants, completion=${completionScore}%, threshold=${minCompletionForNotifications}%, email=${sendNotifyEmail}, whatsapp=${sendWhatsApp}`);

        if (
          digestGrants.length > 0 &&
          completionScore >= minCompletionForNotifications
        ) {
          console.info(`[eligibility-refresh]   SENDING digest notification for ${digestGrants.length} grants to org ${orgId}`);
          await notifyOrgMembers(orgId, "grant_scan_digest", {
            grants: digestGrants,
            profileName,
          }, {
            sendEmail: sendNotifyEmail,
            sendWhatsApp: !sendWhatsApp ? false : undefined,
          });
          for (const item of digestGrants) {
            if (item.score >= eligibleThreshold && sendWhatsApp) {
              await notifyOrgMembers(orgId, "grant_match_high", {
                grantId: item.grantId,
                grantName: item.grantName,
                score: item.score,
                startApplicationToken: item.startApplicationToken,
              }, { sendEmail: sendNotifyEmail, sendWhatsApp: true });
            }
            await supabase
              .from("EligibilityAssessment")
              .update({ notified_at: new Date().toISOString() })
              .eq("organisation_id", orgId)
              .eq("profile_id", profile.id)
              .eq("grant_id", item.grantId);
          }
          notifiedCount += digestGrants.length;
        } else if (digestGrants.length > 0 && completionScore < minCompletionForNotifications) {
          console.info(
            `[eligibility-refresh] Skipping digest for org ${orgId} profile ${profile.id}: completion ${completionScore}% < ${minCompletionForNotifications}%`
          );
        }

        // Persist scores for all other grants (beyond top 25) so the grants list shows eligibility for every grant.
        const restMatches = matches.slice(TOP_N);
        for (const m of restMatches) {
          const { error: batchErr } = await supabase.from("EligibilityAssessment").upsert(
            {
              organisation_id: orgId,
              profile_id: profile.id,
              grant_id: m.grantId,
              score: m.score,
              decision: scoreToDecision(m.score),
              summary: m.reason ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "organisation_id,profile_id,grant_id" }
          );
          if (batchErr) console.error("[eligibility-refresh] batch upsert", m.grantId, batchErr);
        }
      } catch (err) {
        console.error(`[eligibility-refresh] org ${orgId} profile ${(profile as { id?: string }).id}:`, err);
      }
    }

    diagnostics.notified = notifiedCount;
    diagnostics.refreshed = profilesWithOrg.length;
    if (notifiedCount === 0) {
      console.info("[eligibility-refresh] No digest/high-fit notifications sent; run output has diagnostics", diagnostics);
    }
    return { ...diagnostics };
}

export const eligibilityRefresh = inngest.createFunction(
  { id: "eligibility-refresh", name: "Eligibility cache refresh & high-fit notifications" },
  { cron: "*/30 * * * *" }, // every 30 minutes for always-fresh scores and automatic notifications
  async () => runEligibilityRefreshJob()
);

export const eligibilityRefreshRequested = inngest.createFunction(
  { id: "eligibility-refresh-requested", name: "Eligibility refresh on demand" },
  { event: "eligibility/refresh.requested" },
  async () => runEligibilityRefreshJob()
);
