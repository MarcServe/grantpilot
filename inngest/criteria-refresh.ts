import { loadCriteria } from "@/lib/criteria-store";
import { criteriaEnabled } from "@/lib/criteria-flags";
import { recordUsage } from "@/lib/plan-check";
import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProfileMatches } from "@/lib/profile-matches";
import { extractCriteriaDocument } from "@/lib/criteria-source";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { getEligibilityDecision } from "@/lib/claude";
import { profileToMatching } from "@/lib/profile-for-matching";
import { clearEligibleMatchCaches } from "@/lib/eligible-match-cache";

export const criteriaRefreshRequested = inngest.createFunction(
  {
    id: "criteria-refresh",
    retries: 2,
    concurrency: { limit: 1, key: "event.data.profileId" },
    onFailure: async ({ event, error }) => {
      const runId = String(event.data.event.data.runId);
      await getSupabaseAdmin()
        .from("criteria_refresh_runs")
        .update({
          status: "failed",
          error: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
    },
  },
  { event: "criteria/refresh.requested" },
  async ({ event, step }) => {
    const runId = String(event.data.runId);
    if (!criteriaEnabled())
      throw new Error("Criteria verification is disabled");
    const db = getSupabaseAdmin();
    const run = await step.run("load-run", async () => {
      const result = await db
        .from("criteria_refresh_runs")
        .select("*")
        .eq("id", runId)
        .single();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    });
    if (run.status === "completed") return run.result;
    try {
      const profile = await step.run("start", async () => {
        const p = await db
          .from("BusinessProfile")
          .select("*")
          .eq("id", run.profile_id)
          .eq("organisationId", run.organisation_id)
          .single();
        if (p.error) throw new Error(p.error.message);
        const u = await db
          .from("criteria_refresh_runs")
          .update({
            status: "running",
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", runId);
        if (u.error) throw new Error(u.error.message);
        return p.data;
      });
      await step.run("record-usage", () =>
        recordUsage(run.organisation_id, "match"),
      );
      const ids = [
        ...new Set(
          [run.grant_id, ...Object.keys(run.before_matches ?? {})].filter(
            Boolean,
          ),
        ),
      ] as string[];
      let rechecked = 0;
      for (const grantId of ids) {
        const checked = await step.run(`assess-${grantId}`, async () => {
          const g = await db
            .from("Grant")
            .select("*")
            .eq("id", grantId)
            .single();
          if (g.error) throw new Error(g.error.message);
          if (!isGrantActionableNow(g.data)) return false;
          if (grantId === run.grant_id && run.reextract) {
            const document = await extractCriteriaDocument(
              g.data.detailUrl || g.data.applicationUrl,
              g.data.name,
            );
            const saved = await db.from("grant_criteria_documents").upsert({
              grant_id: grantId,
              document,
              updated_at: new Date().toISOString(),
            });
            if (saved.error) throw new Error(saved.error.message);
          }
          const result = await getEligibilityDecision(
            profileToMatching(profile),
            {
              ...g.data,
              sectors: g.data.sectors ?? [],
              regions: g.data.regions ?? [],
              eligibility: g.data.eligibility ?? "",
            },
          );
          const saved = await db.from("EligibilityAssessment").upsert(
            {
              organisation_id: run.organisation_id,
              profile_id: run.profile_id,
              grant_id: grantId,
              score: result.score ?? result.confidence,
              decision: result.decision,
              summary: result.summary ?? result.reason,
              reasons: result.reasons ?? [],
              met_criteria: result.met ?? [],
              missing_criteria: result.missing ?? [],
              improvement_plan: result.improvementPlan ?? null,
              scoring_source: "openai",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "organisation_id,profile_id,grant_id" },
          );
          if (saved.error) throw new Error(saved.error.message);
          const criteria = await loadCriteria(
            run.organisation_id,
            run.profile_id,
            [grantId],
          );
          const checked = criteria.assess(grantId, profile);
          const snapshot = await db.from("grant_criteria_assessments").upsert(
            {
              organisation_id: run.organisation_id,
              profile_id: run.profile_id,
              grant_id: grantId,
              assessment: checked,
              assessed_at: new Date().toISOString(),
            },
            { onConflict: "organisation_id,profile_id,grant_id" },
          );
          if (snapshot.error) throw new Error(snapshot.error.message);
          return true;
        });
        if (checked) rechecked++;
        await step.run(`progress-${grantId}`, async () => {
          const update = await db
            .from("criteria_refresh_runs")
            .update({
              result: { rechecked, total: ids.length },
              updated_at: new Date().toISOString(),
            })
            .eq("id", runId);
          if (update.error) throw new Error(update.error.message);
        });
      }
      return await step.run("finish", async () => {
        const current = await db
          .from("BusinessProfile")
          .select("*")
          .eq("id", run.profile_id)
          .eq("organisationId", run.organisation_id)
          .single();
        if (current.error) throw new Error(current.error.message);
        if (
          JSON.stringify(profileToMatching(current.data)) !==
          JSON.stringify(profileToMatching(profile))
        )
          throw new Error(
            "Business facts changed during this refresh. Recheck using the latest facts.",
          );
        clearEligibleMatchCaches();
        const portfolio = await getProfileMatches(
          run.organisation_id,
          run.profile_id,
        );
        const before = run.before_matches as Record<string, string>;
        const after = Object.fromEntries(
          Object.entries(portfolio.sections).flatMap(([s, rows]) =>
            rows.map((g) => [g.grantId, s]),
          ),
        );
        const result = {
          rechecked,
          total: ids.length,
          becameStrong: Object.keys(after).filter(
            (id) => after[id] === "suggested" && before[id] !== "suggested",
          ).length,
          leftStrong: Object.keys(before).filter(
            (id) => before[id] === "suggested" && after[id] !== "suggested",
          ).length,
          removed: Object.keys(before).filter((id) => !(id in after)).length,
          version: portfolio.version,
        };
        const update = await db
          .from("criteria_refresh_runs")
          .update({
            status: "completed",
            result,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", runId);
        if (update.error) throw new Error(update.error.message);
        console.info("[criteria-refresh] completed", { runId, ...result });
        return result;
      });
    } catch (error) {
      console.warn("[criteria-refresh] attempt failed", {
        runId,
        message: error instanceof Error ? error.message : "Refresh failed",
      });
      throw error;
    }
  },
);
