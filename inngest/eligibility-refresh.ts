import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getEligibilityDecision } from "@/lib/claude";
import { notifyOrgMembers } from "@/lib/notify";
import { grantMatchesFunderLocations } from "@/lib/constants";
import { createStartApplicationToken } from "@/lib/start-application-token";
import { checkRequirementsAgainstDocuments } from "@/lib/grant-requirements";
import type { DigestGrantItem } from "@/lib/notify";
import type { RequiredAttachment } from "@/lib/grant-requirements";
import { getEligibilityNotifyMinCompletion } from "@/lib/eligibility-notify-config";
import { preFilterGrants } from "@/lib/heuristic-scorer";
import { rankGrantsByEmbedding, generateAndStoreProfileEmbedding } from "@/lib/embeddings";
import { isEligibilityNotificationTime } from "@/lib/timezone";

/**
 * 3-Layer Eligibility Pipeline
 * 
 * Layer 1 (FREE):  Heuristic pre-filter — deadline, region, sector, funding range, applicant type
 * Layer 2 (CHEAP): Embedding similarity — OpenAI text-embedding-3-small, cosine ranking
 * Layer 3 (EXPENSIVE): Claude — only for top 10 candidates, deep eligibility reasoning
 * 
 * + Cache: skip grants already scored within CACHE_DAYS
 */

const LAYER2_TOP_N = 15;
const LAYER3_TOP_N = 10;
const DIGEST_SCORE_THRESHOLD = 0;
const NOTIFY_COOLDOWN_DAYS = 1;
const CACHE_DAYS = 1;

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
  const raw = profile.completionScore ?? profile.completion_score;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

export async function runEligibilityRefreshJob(options?: {
  orgIdsFilter?: Set<string>;
}): Promise<{
  totalGrants: number;
  orgsWithProfile: number;
  profilesProcessed: number;
  notified: number;
  refreshed: number;
  layer1Filtered: number;
  layer2Ranked: number;
  layer3Scored: number;
  cacheHits: number;
}> {
    const orgIdsFilter = options?.orgIdsFilter;
    const supabase = getSupabaseAdmin();
    const { data: grantsData } = await supabase.from("Grant").select("id, name, funder, amount, deadline, eligibility, description, objectives, applicantTypes, sectors, regions, funderLocations, required_attachments, url_status");
    const allGrants = (grantsData ?? []).filter((g: { url_status?: string }) => {
      const status = g.url_status ?? "unknown";
      return status !== "dead" && status !== "expired";
    });
    const diagnostics = {
      totalGrants: allGrants.length,
      orgsWithProfile: 0,
      profilesProcessed: 0,
      notified: 0,
      refreshed: 0,
      layer1Filtered: 0,
      layer2Ranked: 0,
      layer3Scored: 0,
      cacheHits: 0,
    };
    if (allGrants.length === 0) {
      console.info("[eligibility-refresh] No grants in DB", diagnostics);
      return { ...diagnostics };
    }

    const { data: profilesData } = await supabase.from("BusinessProfile").select("*");
    const profiles = profilesData ?? [];

    const minCompletionForNotifications = getEligibilityNotifyMinCompletion();
    let profilesWithOrg = profiles.filter((p) => getProfileOrgId(p as { organisationId?: string; organisation_id?: string }) != null);

    if (orgIdsFilter) {
      profilesWithOrg = profilesWithOrg.filter((p) =>
        orgIdsFilter.has(getProfileOrgId(p as { organisationId?: string; organisation_id?: string })!)
      );
      console.info(`[eligibility-refresh] Timezone filter: processing ${profilesWithOrg.length} profiles for ${orgIdsFilter.size} orgs at 8:30 AM local`);
    }

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

    type GrantRow = { id: string; name: string; funder: string; amount?: number; deadline?: string; eligibility: string; description?: string; objectives?: string; applicantTypes?: string[]; sectors: string[]; regions: string[]; funderLocations?: string[]; required_attachments?: unknown };
    const grantsList = allGrants as GrantRow[];

    const cacheThreshold = new Date();
    cacheThreshold.setDate(cacheThreshold.getDate() - CACHE_DAYS);

    for (const profile of profilesWithOrg) {
      const orgId = getProfileOrgId(profile as { organisationId?: string; organisation_id?: string })!;
      const profileId = (profile as { id?: string }).id ?? "unknown";
      try {
        const completionScore = getProfileCompletionScore(profile as Record<string, unknown>);
        const profileName = (profile as { businessName?: string }).businessName ?? profileId;
        console.info(`[eligibility-refresh] Processing org=${orgId} profile=${profileId} "${profileName}" completion=${completionScore}%`);

        // ── Funder location pre-filter (existing) ──
        const userFunderLocations = (profile as { funderLocations?: string[] }).funderLocations;
        const locationFiltered = grantsList.filter((g) => grantMatchesFunderLocations(g.funderLocations, userFunderLocations));
        console.info(`[eligibility-refresh]   ${locationFiltered.length} grants match funder locations (of ${grantsList.length} total)`);

        if (locationFiltered.length === 0) {
          console.info(`[eligibility-refresh]   Skipping: no grants match user funderLocations`);
          continue;
        }

        // ── LAYER 1: Heuristic pre-filter (FREE) ──
        const heuristicProfile = {
          location: String((profile as Record<string, unknown>).location ?? ""),
          sector: String((profile as Record<string, unknown>).sector ?? ""),
          fundingMin: Number((profile as Record<string, unknown>).fundingMin ?? (profile as Record<string, unknown>).funding_min ?? 0),
          fundingMax: Number((profile as Record<string, unknown>).fundingMax ?? (profile as Record<string, unknown>).funding_max ?? 0),
          fundingPurposes: Array.isArray((profile as Record<string, unknown>).fundingPurposes) ? (profile as Record<string, unknown>).fundingPurposes as string[] : [],
          employeeCount: (profile as Record<string, unknown>).employeeCount != null ? Number((profile as Record<string, unknown>).employeeCount) : null,
          annualRevenue: (profile as Record<string, unknown>).annualRevenue != null ? Number((profile as Record<string, unknown>).annualRevenue) : null,
        };

        const heuristicResults = preFilterGrants(
          heuristicProfile,
          locationFiltered.map((g) => ({
            id: g.id,
            amount: g.amount,
            deadline: g.deadline,
            eligibility: g.eligibility,
            sectors: g.sectors ?? [],
            regions: g.regions ?? [],
            applicantTypes: g.applicantTypes,
            description: g.description,
            objectives: g.objectives,
          }))
        );
        diagnostics.layer1Filtered += heuristicResults.length;
        console.info(`[eligibility-refresh]   LAYER 1 (heuristic): ${locationFiltered.length} → ${heuristicResults.length} passed`);

        if (heuristicResults.length === 0) {
          console.info(`[eligibility-refresh]   No grants passed heuristic filter`);
          continue;
        }

        // ── CACHE CHECK: skip grants already scored recently ──
        const candidateIds = heuristicResults.map((r) => r.grantId);
        const { data: cachedRows } = await supabase
          .from("EligibilityAssessment")
          .select("grant_id, updated_at, score, decision, summary")
          .eq("organisation_id", orgId)
          .eq("profile_id", profileId)
          .in("grant_id", candidateIds)
          .gte("updated_at", cacheThreshold.toISOString());

        const cachedGrantIds = new Set((cachedRows ?? []).map((r: { grant_id: string }) => r.grant_id));
        const uncachedIds = candidateIds.filter((id) => !cachedGrantIds.has(id));
        diagnostics.cacheHits += cachedGrantIds.size;
        console.info(`[eligibility-refresh]   CACHE: ${cachedGrantIds.size} already scored (within ${CACHE_DAYS}d), ${uncachedIds.length} need scoring`);

        // ── LAYER 2: Embedding similarity (CHEAP) ──
        let layer2Candidates: string[];
        if (uncachedIds.length <= LAYER3_TOP_N) {
          layer2Candidates = uncachedIds;
        } else {
          try {
            await generateAndStoreProfileEmbedding(profileId);
            const embeddingRanked = await rankGrantsByEmbedding(profileId, uncachedIds, LAYER2_TOP_N);
            layer2Candidates = embeddingRanked.map((r) => r.grantId);
            diagnostics.layer2Ranked += embeddingRanked.length;
            if (embeddingRanked.length > 0) {
              const topSims = embeddingRanked.slice(0, 5).map((r) => `${r.grantId.slice(0, 12)}:${r.similarity.toFixed(3)}`);
              console.info(`[eligibility-refresh]   LAYER 2 (embeddings): ${uncachedIds.length} → ${embeddingRanked.length}, top: ${topSims.join(", ")}`);
            }
          } catch (embErr) {
            console.warn(`[eligibility-refresh]   LAYER 2 failed (falling back to heuristic order): ${embErr instanceof Error ? embErr.message : embErr}`);
            layer2Candidates = uncachedIds.slice(0, LAYER2_TOP_N);
            diagnostics.layer2Ranked += layer2Candidates.length;
          }
        }

        // ── LAYER 3: Claude deep scoring (EXPENSIVE — only top N) ──
        const layer3Ids = layer2Candidates.slice(0, LAYER3_TOP_N);
        console.info(`[eligibility-refresh]   LAYER 3 (Claude): scoring ${layer3Ids.length} grants`);

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

        const { data: profileDocsData } = await supabase.from("Document").select("name, type, category").eq("profileId", profileId);
        const profileDocsAlt = !profileDocsData?.length
          ? await supabase.from("Document").select("name, type, category").eq("profile_id", profileId)
          : { data: profileDocsData };
        const profileDocuments = (profileDocsAlt.data ?? []).map((d: { name: string; type?: string; category?: string }) => ({
          name: d.name,
          type: d.type ?? "",
          category: d.category ?? null,
        }));

        for (const grantId of layer3Ids) {
          const grant = locationFiltered.find((g) => g.id === grantId);
          if (!grant) continue;

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
            diagnostics.layer3Scored++;

            const score = result.score ?? result.confidence;
            const summary = result.summary ?? result.reason ?? undefined;

            const { error: upsertErr } = await supabase.from("EligibilityAssessment").upsert(
              {
                organisation_id: orgId,
                profile_id: profileId,
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
                .eq("profile_id", profileId)
                .eq("grant_id", grant.id)
                .single();

              const notifiedAt = (existing as { notified_at: string | null } | null)?.notified_at;
              const includeInDigest = !notifiedAt || new Date(notifiedAt) < cooldown;
              if (includeInDigest) {
                const startApplicationToken = createStartApplicationToken({
                  grantId: grant.id,
                  profileId: profileId,
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
            console.error(`[eligibility-refresh]   grant ${grantId} for org ${orgId}: ${errMsg.slice(0, 200)}`);
            if (/credit balance/i.test(errMsg)) {
              console.error(`[eligibility-refresh]   Anthropic credits exhausted — stopping scoring`);
              break;
            }
          }
        }

        // Persist heuristic scores for grants NOT sent to Claude (so grant list still shows something)
        const scoredByClaudeIds = new Set(layer3Ids);
        const unscoredHeuristic = heuristicResults.filter(
          (r) => !scoredByClaudeIds.has(r.grantId) && !cachedGrantIds.has(r.grantId)
        );
        for (const h of unscoredHeuristic) {
          const { error: batchErr } = await supabase.from("EligibilityAssessment").upsert(
            {
              organisation_id: orgId,
              profile_id: profileId,
              grant_id: h.grantId,
              score: h.score,
              decision: scoreToDecision(h.score),
              summary: `Heuristic match: ${h.reasons.join(", ")}`,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "organisation_id,profile_id,grant_id" }
          );
          if (batchErr) console.error("[eligibility-refresh] heuristic upsert", h.grantId, batchErr);
        }

        // ── Notification ──
        console.info(`[eligibility-refresh]   Digest candidates: ${digestGrants.length} grants, completion=${completionScore}%, threshold=${minCompletionForNotifications}%, email=${sendNotifyEmail}, whatsapp=${sendWhatsApp}`);

        if (digestGrants.length > 0 && completionScore >= minCompletionForNotifications) {
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
              .eq("profile_id", profileId)
              .eq("grant_id", item.grantId);
          }
          notifiedCount += digestGrants.length;
        } else if (digestGrants.length > 0 && completionScore < minCompletionForNotifications) {
          console.info(`[eligibility-refresh] Skipping digest: completion ${completionScore}% < ${minCompletionForNotifications}%`);
        }
      } catch (err) {
        console.error(`[eligibility-refresh] org ${orgId} profile ${profileId}:`, err);
      }
    }

    diagnostics.notified = notifiedCount;
    diagnostics.refreshed = profilesWithOrg.length;
    console.info("[eligibility-refresh] Complete", diagnostics);
    return { ...diagnostics };
}

export const eligibilityRefresh = inngest.createFunction(
  { id: "eligibility-refresh", name: "Eligibility 8:30 AM local (hourly check)" },
  { cron: "30 * * * *" },
  async () => {
    const supabase = getSupabaseAdmin();

    const { data: orgsData } = await supabase
      .from("Organisation")
      .select("id, preferredTimezone");

    const allOrgs = (orgsData ?? []) as { id: string; preferredTimezone?: string | null }[];
    const eligible = allOrgs.filter((o) =>
      isEligibilityNotificationTime(o.preferredTimezone ?? "UTC")
    );

    if (eligible.length === 0) {
      console.info(`[eligibility-refresh] No orgs at 8:30 AM local this hour (checked ${allOrgs.length} orgs)`);
      return { skipped: true, orgsChecked: allOrgs.length, orgsAtLocalTime: 0 };
    }

    const orgIds = new Set(eligible.map((o) => o.id));
    console.info(`[eligibility-refresh] ${eligible.length}/${allOrgs.length} orgs at 8:30 AM local — running pipeline`);
    return runEligibilityRefreshJob({ orgIdsFilter: orgIds });
  }
);

export const eligibilityRefreshRequested = inngest.createFunction(
  { id: "eligibility-refresh-requested", name: "Eligibility refresh on demand" },
  { event: "eligibility/refresh.requested" },
  async () => runEligibilityRefreshJob()
);
