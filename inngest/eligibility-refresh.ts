import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getEligibilityDecision } from "@/lib/claude";
import { notifyOrgMembers } from "@/lib/notify";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { createStartApplicationToken } from "@/lib/start-application-token";
import { checkRequirementsAgainstDocuments } from "@/lib/grant-requirements";
import type { DigestGrantItem } from "@/lib/notify";
import type { RequiredAttachment } from "@/lib/grant-requirements";
import { getEligibilityNotifyMinCompletion } from "@/lib/eligibility-notify-config";
import { preFilterGrants } from "@/lib/heuristic-scorer";
import { rankGrantsByEmbedding, generateAndStoreProfileEmbedding } from "@/lib/embeddings";
import { isEligibilityNotificationTime } from "@/lib/timezone";
import { isGrantLinkUsable } from "@/lib/grant-freshness";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { isOpenAIChecked } from "@/lib/grant-source-policy";

/**
 * 3-Layer Eligibility Pipeline
 * 
 * Layer 1 (FREE):  Heuristic pre-filter — deadline, region, sector, funding range, applicant type
 * Layer 2 (CHEAP): Embedding similarity — OpenAI text-embedding-3-small, cosine ranking
 * Layer 3 (EXPENSIVE): OpenAI — only for top 10 candidates, deep eligibility reasoning
 * 
 * + Cache: skip grants already scored within CACHE_DAYS
 */

const LAYER2_TOP_N = 15;
const LAYER3_TOP_N = 10;
const DIGEST_SCORE_THRESHOLD = 85;
const MIN_NOTIFICATION_SCORE_FLOOR = 75;
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
    businessType: String(get("businessType") ?? get("business_type") ?? ""),
    fundingOutcomeSignals: profile.fundingOutcomeSignals != null ? String(profile.fundingOutcomeSignals) : null,
  };
}

function buildOutcomeSignals(outcomes: unknown[] | null): string {
  const rows = Array.isArray(outcomes) ? outcomes : [];
  return rows
    .slice(0, 8)
    .map((row) => {
      const item = row as { outcome?: string; awardedAmount?: number | null; funderFeedback?: string | null; Grant?: { name?: string; funder?: string } | { name?: string; funder?: string }[] };
      const grant = Array.isArray(item.Grant) ? item.Grant[0] : item.Grant;
      const amount = item.awardedAmount ? `, awarded £${Number(item.awardedAmount).toLocaleString("en-GB")}` : "";
      const feedback = item.funderFeedback ? `, feedback: ${item.funderFeedback.slice(0, 240)}` : "";
      return `${grant?.name ?? "Grant"} (${grant?.funder ?? "Funder"}): ${item.outcome ?? "unknown"}${amount}${feedback}`;
    })
    .join("\n");
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

function notificationMinScore(preferenceScore: number | undefined): number {
  return Math.max(preferenceScore ?? DIGEST_SCORE_THRESHOLD, MIN_NOTIFICATION_SCORE_FLOOR);
}

function shouldNotifyForEligibility(score: number, decision?: string | null, scoringSource?: string | null): boolean {
  return isOpenAIChecked(scoringSource) && decision === "likely_eligible" && score >= MIN_NOTIFICATION_SCORE_FLOOR;
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
    const allGrants = (grantsData ?? []).filter(isGrantLinkUsable);
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

        const appliedGrantIds = await getAppliedGrantIds(supabase, orgId, profileId);
        const unappliedGrants = grantsList.filter((g) => !appliedGrantIds.has(g.id));
        console.info(`[eligibility-refresh]   Excluding ${appliedGrantIds.size} grants with existing applications`);

        // ── Funder location pre-filter (existing) ──
        const userFunderLocations = inferFunderLocationsFromProfile(profile as {
          funderLocations?: string[] | null;
          location?: string | null;
          country?: string | null;
          region?: string | null;
        });
        const locationFiltered = unappliedGrants.filter((g) => grantMatchesFunderLocations(g.funderLocations, userFunderLocations));
        console.info(`[eligibility-refresh]   ${locationFiltered.length} grants match funder locations (of ${unappliedGrants.length} unapplied, ${grantsList.length} total)`);

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
          businessType: String((profile as Record<string, unknown>).businessType ?? (profile as Record<string, unknown>).business_type ?? "") || null,
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

        // ── LAYER 3: OpenAI deep scoring (EXPENSIVE — only top N) ──
        const layer3Ids = layer2Candidates.slice(0, LAYER3_TOP_N);
        console.info(`[eligibility-refresh]   LAYER 3 (OpenAI): scoring ${layer3Ids.length} grants`);

        const { data: prefs } = await supabase
          .from("EligibilityNotificationPreference")
          .select("min_score, max_score, eligible_threshold, notify_email, notify_in_app, notify_whatsapp")
          .eq("organisation_id", orgId)
          .maybeSingle();
        const minScore = notificationMinScore((prefs as { min_score?: number } | null)?.min_score);
        const maxScore = (prefs as { max_score?: number } | null)?.max_score ?? 100;
        const eligibleThreshold = notificationMinScore((prefs as { eligible_threshold?: number } | null)?.eligible_threshold);
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
        const { data: outcomeRows } = await supabase
          .from("ApplicationOutcome")
          .select("outcome, awardedAmount, funderFeedback, Grant(name, funder)")
          .eq("organisationId", orgId)
          .eq("profileId", profileId)
          .order("reportedAt", { ascending: false })
          .limit(8);
        const fundingOutcomeSignals = buildOutcomeSignals(outcomeRows ?? []);

        for (const grantId of layer3Ids) {
          const grant = locationFiltered.find((g) => g.id === grantId);
          if (!grant) continue;

          try {
            const result = await getEligibilityDecision(
              profileToMatching({
                ...(profile as Record<string, unknown>),
                fundingOutcomeSignals,
              }),
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
                scoring_source: "openai",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "organisation_id,profile_id,grant_id" }
            );
            if (upsertErr) console.error("[eligibility-refresh] upsert", upsertErr);

            const inRange =
              score >= minScore &&
              score <= maxScore &&
              shouldNotifyForEligibility(score, result.decision, "openai");

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
                  summary:
                    summary ??
                    "Full company-DNA assessment found a strong match between your profile and this grant.",
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
            if (/credit balance|quota|billing/i.test(errMsg)) {
              console.error(`[eligibility-refresh]   OpenAI billing or quota issue — stopping scoring`);
              break;
            }
          }
        }

        // Persist low-confidence heuristic scores for grants not sent to OpenAI.
        // These keep the list ordered without pretending a full AI eligibility assessment has run.
        const scoredByOpenAIIds = new Set(layer3Ids);
        const unscoredHeuristic = heuristicResults.filter(
          (r) => !scoredByOpenAIIds.has(r.grantId) && !cachedGrantIds.has(r.grantId)
        );
        for (const h of unscoredHeuristic) {
          const { error: batchErr } = await supabase.from("EligibilityAssessment").upsert(
            {
              organisation_id: orgId,
              profile_id: profileId,
              grant_id: h.grantId,
              score: Math.min(h.score, 69),
              decision: scoreToDecision(Math.min(h.score, 69)),
              summary: `Preliminary fit only: ${h.reasons.join(", ")}. Open the grant and run a fresh GrantsCopilot check for company-DNA reasoning.`,
              reasons: h.reasons,
              scoring_source: "heuristic",
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
