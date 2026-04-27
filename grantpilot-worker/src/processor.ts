import { getSupabase } from "./supabase.js";
import type { CuSession, CuSessionItem } from "./types.js";
import { extractEmailFromUrl } from "./claude.js";
import { fetchProfileAndDocuments } from "./profile-data.js";
import { launchGrantBrowser, newGrantPage } from "./browser.js";
import { runGrantStep } from "./grant-steps.js";
import { getNextScoutJob, processScoutJob, ApiCreditError, resolveScoutMode } from "./scout.js";
import { getPortalRecipe, toRecipeRef, type PortalRecipeRef } from "./portals/index.js";

const POLL_INTERVAL_MS = 5000;
const PROGRESS_UPDATE_EVERY = 5;
const MAX_STEP_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

const API_CREDIT_BACKOFF_BASE_MS = 60_000;
const API_CREDIT_BACKOFF_MAX_MS = 30 * 60_000;
const API_CREDIT_RESET_AFTER_SUCCESS = 3;

class SessionStoppedError extends Error {
  constructor() {
    super("Stopped by user");
    this.name = "SessionStoppedError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function getNextRunnableSession(): Promise<CuSession | null> {
  const { data, error } = await getSupabase()
    .from("cu_sessions")
    .select("*")
    .in("status", ["running", "resumed"])
    .order("started_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return (data?.[0] as CuSession) ?? null;
}

async function getPendingItems(sessionId: number, limit = 50): Promise<CuSessionItem[]> {
  const { data, error } = await getSupabase()
    .from("cu_session_items")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "pending")
    .order("id", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as CuSessionItem[];
}

async function markItemStatus(
  itemId: number,
  status: string,
  patch: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await getSupabase()
    .from("cu_session_items")
    .update({ status, ...patch })
    .eq("id", itemId);
  if (error) throw error;
}

async function appendLog(
  sessionId: number,
  step: string,
  action: string,
  detail: string,
  success = true
): Promise<void> {
  const { error } = await getSupabase().from("cu_session_logs").insert({
    session_id: sessionId,
    step,
    action,
    detail,
    success,
  });
  if (error) throw error;
}

async function updateSessionProgress(
  sessionId: number,
  processedItems: number,
  lastCheckpoint?: string
): Promise<void> {
  const patch: Record<string, unknown> = { processed_items: processedItems };
  if (lastCheckpoint) patch.last_checkpoint = lastCheckpoint;

  const { error } = await getSupabase()
    .from("cu_sessions")
    .update(patch)
    .eq("id", sessionId);
  if (error) throw error;
}

async function getSessionState(sessionId: number): Promise<{ status: string | null; errorLog: string | null }> {
  const { data, error } = await getSupabase()
    .from("cu_sessions")
    .select("status, error_log")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { status?: string; error_log?: string | null } | null;
  return { status: row?.status ?? null, errorLog: row?.error_log ?? null };
}

async function throwIfSessionStopped(sessionId: number): Promise<void> {
  const { status, errorLog } = await getSessionState(sessionId);
  if (status === "failed" && /stopped by user/i.test(errorLog ?? "")) {
    throw new SessionStoppedError();
  }
}

async function isSessionPaused(sessionId: number): Promise<boolean> {
  const { status } = await getSessionState(sessionId);
  return status === "paused";
}

async function completeSession(sessionId: number): Promise<void> {
  const { error } = await getSupabase()
    .from("cu_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

async function failSession(sessionId: number, errorLog: string): Promise<void> {
  const { error } = await getSupabase()
    .from("cu_sessions")
    .update({ status: "failed", error_log: errorLog })
    .eq("id", sessionId);
  if (error) throw error;
}

/** Fetch grant required_attachments for smart document/video matching. */
async function fetchGrantRequiredAttachments(grantId: string | null): Promise<unknown[]> {
  if (!grantId) return [];
  const { data } = await getSupabase()
    .from("Grant")
    .select("required_attachments")
    .eq("id", grantId)
    .maybeSingle();
  const raw = (data as { required_attachments?: unknown } | null)?.required_attachments;
  return Array.isArray(raw) ? raw : [];
}

/** Fetch grant name, funder, eligibility, description for vision-first, tone-aware filling. */
async function fetchGrantContext(grantId: string | null): Promise<{ name: string; funder: string; eligibility: string; description?: string; objectives?: string } | null> {
  if (!grantId) return null;
  const { data } = await getSupabase()
    .from("Grant")
    .select("name, funder, eligibility, description, objectives")
    .eq("id", grantId)
    .maybeSingle();
  const row = data as { name?: string; funder?: string; eligibility?: string; description?: string; objectives?: string } | null;
  if (!row || !row.name || !row.funder) return null;
  return {
    name: String(row.name),
    funder: String(row.funder),
    eligibility: String(row.eligibility ?? ""),
    description: row.description != null ? String(row.description) : undefined,
    objectives: row.objectives != null ? String(row.objectives) : undefined,
  };
}

/** Resolve a portal recipe for a grant URL. Checks session items' extra_data first, then URL lookup. */
function resolvePortalRecipe(pending: CuSessionItem[], grantUrl: string | null): PortalRecipeRef | null {
  for (const item of pending) {
    const extra = item.extra_data as Record<string, unknown> | null;
    if (extra?.portalRecipe) return extra.portalRecipe as PortalRecipeRef;
  }
  if (grantUrl) {
    const recipe = getPortalRecipe(grantUrl);
    if (recipe) return toRecipeRef(recipe);
  }
  return null;
}

/** Fetch encrypted portal credential for an org + portal host, and decrypt it. */
async function fetchPortalCredentials(
  orgId: string | null,
  portalRecipe: PortalRecipeRef | null
): Promise<{ username: string; password: string } | null> {
  if (!orgId || !portalRecipe) return null;

  // Derive the host from the portal recipe's loginUrl or id
  let portalHost = "";
  if (portalRecipe.loginUrl) {
    try { portalHost = new URL(portalRecipe.loginUrl).hostname; } catch { /* ignore */ }
  }
  if (!portalHost) return null;

  const { data } = await getSupabase()
    .from("PortalCredential")
    .select("username, encryptedPassword")
    .eq("organisationId", orgId)
    .eq("portalHost", portalHost)
    .maybeSingle();

  const row = data as { username?: string; encryptedPassword?: string } | null;
  if (!row?.username || !row?.encryptedPassword) return null;

  try {
    const { createDecipheriv } = await import("crypto");
    const keyHex = process.env.PORTAL_ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) return null;
    const key = Buffer.from(keyHex, "hex");
    const buf = Buffer.from(row.encryptedPassword, "base64");
    if (buf.length < 29) return null; // iv(12) + min ciphertext(1) + tag(16)
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const ciphertext = buf.subarray(12, buf.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const password = decipher.update(ciphertext) + decipher.final("utf8");
    return { username: row.username, password };
  } catch (e) {
    console.error("[processor] credential decryption failed:", e);
    return null;
  }
}

/**
 * Process all pending grant_application items with one browser session.
 * Opens grant URL once, then runs fill/upload/prepare/submit steps in order.
 */
async function processGrantApplicationSession(
  session: CuSession,
  pending: CuSessionItem[]
): Promise<{ processed: number; failed: boolean; failReason?: string }> {
  const profileId = session.business_profile_id ?? "";
  const grantId = pending[0]?.grant_id ?? null;
  const requiredAttachmentsRaw = await fetchGrantRequiredAttachments(grantId);
  const requiredAttachments = requiredAttachmentsRaw.filter(
    (r): r is { kind: string; label: string; categoryHint?: string; maxDurationMinutes?: number; maxSizeMB?: number; accept?: string } =>
      r != null &&
      typeof r === "object" &&
      (r as { kind?: string }).kind != null &&
      typeof (r as { label?: string }).label === "string"
  ) as { kind: "video" | "document"; label: string; categoryHint?: string; maxDurationMinutes?: number; maxSizeMB?: number; accept?: string }[];

  const grantContext = await fetchGrantContext(grantId);
  const applicationIdForProfile = session.public_id.startsWith("grantapp_") ? session.public_id.replace(/^grantapp_/, "") : undefined;
  const { profile, documents } = (await fetchProfileAndDocuments(profileId, applicationIdForProfile)) ?? {
    profile: {
      businessName: "",
      tradingName: null,
      registrationNumber: null,
      charityNumber: null,
      vatNumber: null,
      yearEstablished: null,
      location: "",
      registeredAddress: null,
      operatingAddress: null,
      postcode: null,
      country: null,
      region: null,
      primaryContactName: null,
      primaryContactRole: null,
      primaryContactEmail: null,
      primaryContactPhone: null,
      primaryContactLinkedIn: null,
      preferredContactMethod: null,
      sector: "",
      missionStatement: "",
      description: "",
      employeeCount: null,
      contractorCount: null,
      annualRevenue: null,
      profitLoss: null,
      cashReserves: null,
      financialProjections: null,
      previousGrants: null,
      fundingMin: 0,
      fundingMax: 0,
      fundingPurposes: [],
      fundingDetails: null,
      coFundingAvailable: null,
      matchFundingDetails: null,
      directorNames: null,
      directorProfiles: null,
      teamMembers: null,
      boardMembers: null,
      founderBackground: null,
      projectTitle: null,
      projectSummary: null,
      problemStatement: null,
      proposedSolution: null,
      projectObjectives: null,
      expectedOutcomes: null,
      projectStartDate: null,
      projectEndDate: null,
      beneficiaryGroups: null,
      beneficiaryCount: null,
      geographicImpact: null,
      diversityInclusionImpact: null,
      jobsCreated: null,
      revenueGrowthExpected: null,
      co2Reduction: null,
      productivityImprovements: null,
      milestones: null,
      deliverables: null,
      partnerOrganisations: null,
      collaborationDetails: null,
      risksMitigation: null,
      exitStrategy: null,
      projectSustainabilityPlan: null,
      websiteIntelligence: null,
      socialImpact: null,
      innovationCapabilities: null,
      sustainabilityInitiatives: null,
      communityEngagement: null,
      keyAchievements: null,
      teamExpertise: null,
      learnedApplicationAnswers: null,
    },
    documents: [],
  };

  // Resolve portal recipe from session items or grant URL
  const grantUrl = pending[0]?.grant_url ?? null;
  const portalRecipe = resolvePortalRecipe(pending, grantUrl);
  const orgId = session.organisation_id ?? null;
  const portalCredentials = await fetchPortalCredentials(orgId, portalRecipe);

  if (portalRecipe) {
    console.log(`[processor] Portal detected: ${portalRecipe.portalName} (${portalRecipe.id}), credentials: ${portalCredentials ? "yes" : "no"}`);
  }

  const browser = await launchGrantBrowser();
  const page = await newGrantPage(browser);
  let processed = 0;

  const applicationId = session.public_id.replace(/^grantapp_/, "");

  let editedSnapshotFields: { label: string; name: string; value: string }[] | undefined;
  let needsInputAnswers: Record<string, string> | undefined;
  let focusNotes: string | undefined;
  let applicationStatus: string | undefined;
  let verifiedFillCount = 0;
  if (applicationId) {
    const { data: appRow } = await getSupabase()
      .from("Application")
      .select("filled_snapshot, needs_input_answers, focusNotes, status")
      .eq("id", applicationId)
      .maybeSingle();
    const row = appRow as {
      filled_snapshot?: { fields?: { label: string; name: string; value: string }[] };
      needs_input_answers?: Record<string, string> | null;
      focusNotes?: string | null;
      status?: string | null;
    } | null;
    applicationStatus = row?.status ?? undefined;
    if (row?.filled_snapshot?.fields?.length) {
      editedSnapshotFields = row.filled_snapshot.fields;
    }
    if (row?.needs_input_answers && typeof row.needs_input_answers === "object") {
      needsInputAnswers = row.needs_input_answers as Record<string, string>;
    }
    if (row?.focusNotes) {
      focusNotes = row.focusNotes;
    }
  }

  const NAVIGATION_ACTIONS = new Set(["open_grant_url", "navigate_to_form", "portal_navigate"]);
  let executionFailed = false;
  let executionFailReason = "";

  try {
    for (const item of pending) {
      await throwIfSessionStopped(session.id);
      const action = (item.action ?? "").toLowerCase();

      // If a terminal step already failed, skip all remaining steps.
      if (executionFailed) {
        await markItemStatus(item.id, "skipped", {
          extra_data: { notes: `Skipped: ${executionFailReason}`, skipped_due_to_failure: true },
          processed_at: new Date().toISOString(),
        });
        await appendLog(session.id, "grant_application", action, `Skipped: terminal failure earlier`, false);
        processed += 1;
        continue;
      }

      await markItemStatus(item.id, "processing");
      await appendLog(session.id, "item_processing", "update", `Item ${item.id} -> processing`);

      let lastResult: Awaited<ReturnType<typeof runGrantStep>> | null = null;
      let attempt = 0;
      const maxAttempts = MAX_STEP_RETRIES + 1;

      try {
        while (attempt < maxAttempts) {
          const isSubmit = action === "submit_application";
          lastResult = await runGrantStep(page, item, profile, documents, {
            requiredAttachments: requiredAttachments.length > 0 ? requiredAttachments : undefined,
            editedSnapshotFields: isSubmit ? editedSnapshotFields : undefined,
            needsInputAnswers,
            grantContext: grantContext ?? undefined,
            focusNotes,
            portalRecipe,
            portalCredentials,
            priorFilledCount: verifiedFillCount,
            allowSubmit: isSubmit && applicationStatus === "APPROVED",
          });
          await throwIfSessionStopped(session.id);
          if (lastResult.success) break;
          if (lastResult.situation) break;
          attempt += 1;
          if (attempt < maxAttempts) {
            await appendLog(
              session.id,
              "grant_application",
              "retry",
              `Attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS / 1000}s…`,
              false
            );
            await sleep(RETRY_DELAY_MS);
          }
        }

        const result = lastResult!;
        if (result.success && result.filledCount && result.filledCount > 0) {
          verifiedFillCount += result.filledCount;
        }

        const isNeedsInput = result.needsInput && result.missingRequired && result.missingRequired.length > 0;
        const itemStatus = isNeedsInput
          ? "pending"
          : result.skipped
            ? "skipped"
            : result.success
              ? "done"
              : "failed";
        const extraData: Record<string, unknown> = {
          notes: result.notes,
          retries: attempt,
        };
        if (result.situation) extraData.page_situation = result.situation;
        if (result.needsDirectUrl) extraData.needs_direct_url = result.needsDirectUrl;
        if (result.needsInput) extraData.needs_input = true;
        if (result.missingRequired) extraData.missing_required = result.missingRequired;
        if (!result.success && !isNeedsInput && NAVIGATION_ACTIONS.has(action)) {
          extraData.skipped_due_to_nav_failure = true;
        }
        const statusPatch: Record<string, unknown> = { extra_data: extraData };
        if (!isNeedsInput) statusPatch.processed_at = new Date().toISOString();
        await markItemStatus(item.id, itemStatus, statusPatch);
        await appendLog(
          session.id,
          "grant_application",
          item.action ?? "step",
          result.notes,
          result.success
        );

        if (!result.success && !isNeedsInput) {
          executionFailed = true;
          executionFailReason = result.notes;
        }

        if (result.success && result.snapshot && applicationId) {
          await getSupabase()
            .from("Application")
            .update({ filled_snapshot: result.snapshot })
            .eq("id", applicationId);
          const appUrl = process.env.APP_URL;
          const internalSecret = process.env.INTERNAL_API_SECRET;
          if (appUrl && internalSecret && session.organisation_id && profileId) {
            try {
              await fetch(`${appUrl.replace(/\/$/, "")}/api/internal/merge-grant-memory`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": internalSecret,
                },
                body: JSON.stringify({
                  profileId,
                  organisationId: session.organisation_id,
                  filledSnapshot: result.snapshot,
                }),
              });
            } catch {
              // non-fatal
            }
          }
        }
        if (result.success && (item.action ?? "").toLowerCase() === "submit_application") {
          if (applicationId) {
            await getSupabase()
              .from("Application")
              .update({ status: "SUBMITTED" })
              .eq("id", applicationId);
            const appUrl = process.env.APP_URL;
            const internalSecret = process.env.INTERNAL_API_SECRET;
            if (appUrl && internalSecret) {
              try {
                await fetch(`${appUrl.replace(/\/$/, "")}/api/internal/notify-application-submitted`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-internal-secret": internalSecret,
                  },
                  body: JSON.stringify({ applicationId }),
                });
              } catch (err) {
                console.error("[worker] notify-application-submitted failed", err);
              }
            }
          }
        }
        if (
          (result.situation === "login_required" || result.situation === "needs_verification") &&
          applicationId
        ) {
          const appUrl = process.env.APP_URL;
          const internalSecret = process.env.INTERNAL_API_SECRET;
          if (appUrl && internalSecret) {
            try {
              await fetch(`${appUrl.replace(/\/$/, "")}/api/internal/notify-login-required`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": internalSecret,
                },
                body: JSON.stringify({ applicationId }),
              });
            } catch (err) {
              console.error("[worker] notify-login-required failed", err);
            }
          }
        }
        if (
          (result.situation === "page_not_found" || result.situation === "competition_list") &&
          item.grant_id
        ) {
          const appUrl = process.env.APP_URL;
          const internalSecret = process.env.INTERNAL_API_SECRET;
          if (appUrl && internalSecret) {
            try {
              await fetch(`${appUrl.replace(/\/$/, "")}/api/internal/enqueue-scout-for-grant`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": internalSecret,
                },
                body: JSON.stringify({ grantId: item.grant_id }),
              });
            } catch (err) {
              console.error("[worker] enqueue-scout-for-grant failed", err);
            }
          }
        }
        if (result.needsInput && result.missingRequired && result.missingRequired.length > 0 && applicationId) {
          await getSupabase()
            .from("Application")
            .update({
              status: "NEEDS_INPUT",
              needs_input: result.missingRequired,
              updatedAt: new Date().toISOString(),
            })
            .eq("id", applicationId);
          await getSupabase()
            .from("cu_sessions")
            .update({ status: "paused", updated_at: new Date().toISOString() })
            .eq("id", session.id);
          const appUrl = process.env.APP_URL;
          const internalSecret = process.env.INTERNAL_API_SECRET;
          if (appUrl && internalSecret) {
            try {
              await fetch(`${appUrl.replace(/\/$/, "")}/api/internal/notify-needs-input`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": internalSecret,
                },
                body: JSON.stringify({ applicationId }),
              });
            } catch (err) {
              console.error("[worker] notify-needs-input failed", err);
            }
          }
          break;
        }
        processed += 1;
      } catch (err) {
        if (err instanceof SessionStoppedError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        await appendLog(session.id, "item_failed", "error", `Item ${item.id}: ${msg}`, false);
        await markItemStatus(item.id, "failed", {
          error_message: msg,
          processed_at: new Date().toISOString(),
        });
      }
    }
  } finally {
    await browser.close();
  }

  return {
    processed,
    failed: executionFailed,
    ...(executionFailReason ? { failReason: executionFailReason } : {}),
  };
}

export async function processSession(session: CuSession): Promise<void> {
  console.log(`[worker] Processing session ${session.public_id} (${session.task_type})`);

  await appendLog(
    session.id,
    "session_start",
    "start",
    `Processing session ${session.public_id} (${session.task_type})`,
    true
  );

  let processed = session.processed_items ?? 0;

  try {
    while (true) {
      await throwIfSessionStopped(session.id);
      const pending = await getPendingItems(session.id, 25);
      if (pending.length === 0) break;

      if (session.task_type === "grant_application") {
        const result = await processGrantApplicationSession(session, pending);
        processed += result.processed;
        if (processed % PROGRESS_UPDATE_EVERY === 0) {
          await updateSessionProgress(session.id, processed, `processed_${processed}`);
        }
        if (result.failed) {
          await updateSessionProgress(session.id, processed, `failed_${processed}`);
          throw new Error(result.failReason ?? "Grant application navigation failed");
        }
        if (await isSessionPaused(session.id)) {
          await appendLog(session.id, "session_paused", "pause", `Paused ${session.public_id}`);
          return;
        }
        continue;
      }

      for (const item of pending) {
        try {
          await throwIfSessionStopped(session.id);
          await markItemStatus(item.id, "processing");
          await appendLog(session.id, "item_processing", "update", `Item ${item.id} -> processing`);

          if (session.task_type === "csv_extraction") {
            const url = item.url ?? "";
            await appendLog(session.id, "extract_email", "navigate", url);

            const result = await extractEmailFromUrl(url);

            await markItemStatus(item.id, "done", {
              email: result.email ?? null,
              company_name: result.companyName ?? null,
              extra_data: result.notes ? { notes: result.notes } : null,
              processed_at: new Date().toISOString(),
            });

            await appendLog(
              session.id,
              "extract_email",
              "result",
              JSON.stringify({ url, email: result.email ?? null })
            );
          } else {
            await appendLog(session.id, "unsupported_task", "skip", `Unsupported: ${session.task_type}`, false);
            await markItemStatus(item.id, "skipped", {
              error_message: `Unsupported task_type: ${session.task_type}`,
            });
          }

          processed += 1;

          if (processed % PROGRESS_UPDATE_EVERY === 0) {
            await updateSessionProgress(session.id, processed, `processed_${processed}`);
          }
        } catch (err) {
          if (err instanceof SessionStoppedError) throw err;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[worker] Item ${item.id} failed:`, msg);
          await appendLog(session.id, "item_failed", "error", `Item ${item.id}: ${msg}`, false);

          try {
            await markItemStatus(item.id, "failed", {
              error_message: msg,
              processed_at: new Date().toISOString(),
            });
          } catch { /* swallow */ }
        }
      }
    }

    await throwIfSessionStopped(session.id);
    if (await isSessionPaused(session.id)) {
      await appendLog(session.id, "session_paused", "pause", `Paused ${session.public_id}`);
      return;
    }
    await updateSessionProgress(session.id, processed, `final_${processed}`);
    await completeSession(session.id);
    await appendLog(session.id, "session_complete", "complete", `Completed ${session.public_id}`);
    console.log(`[worker] Session ${session.public_id} completed (${processed} items)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof SessionStoppedError) {
      console.log(`[worker] Session ${session.public_id} stopped by user`);
      await appendLog(session.id, "session_stopped", "stop", msg, false).catch(() => {});
      return;
    }
    console.error(`[worker] Session ${session.public_id} failed:`, msg);
    await failSession(session.id, msg).catch(() => {});
    await appendLog(session.id, "session_failed", "error", msg, false).catch(() => {});
  }
}

const IDLE_LOG_EVERY_POLLS = 12; // log every ~60s when no work

export async function runLoop(): Promise<void> {
  const initialMode = await resolveScoutMode();
  console.log(`[worker] Starting poll loop... (Scout=${initialMode}, Filer; polling every 5s)`);

  let idlePolls = 0;
  let apiCreditFailures = 0;
  let apiCreditBackoffUntil = 0;
  let successesSinceLastCreditFail = 0;

  while (true) {
    try {
      const scoutMode = await resolveScoutMode();
      const now = Date.now();
      const scoutDisabled = scoutMode === "off";
      const skipScout = scoutDisabled || now < apiCreditBackoffUntil;

      if (!scoutDisabled && now < apiCreditBackoffUntil && idlePolls === 0) {
        const waitSec = Math.round((apiCreditBackoffUntil - now) / 1000);
        console.log(`[worker] API credit circuit breaker active — skipping Scout for ${waitSec}s`);
      }

      if (!skipScout) {
        const scoutJob = await getNextScoutJob();
        if (scoutJob) {
          idlePolls = 0;
          await processScoutJob(scoutJob);
          successesSinceLastCreditFail += 1;
          if (successesSinceLastCreditFail >= API_CREDIT_RESET_AFTER_SUCCESS) {
            apiCreditFailures = 0;
            successesSinceLastCreditFail = 0;
          }
          continue;
        }
      }

      const session = await getNextRunnableSession();

      if (!session) {
        idlePolls += 1;
        if (idlePolls === IDLE_LOG_EVERY_POLLS) {
          console.log("[worker] Idle, no pending Scout jobs or sessions.");
          idlePolls = 0;
        }
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      idlePolls = 0;
      await processSession(session);
    } catch (err) {
      if (err instanceof ApiCreditError) {
        apiCreditFailures += 1;
        successesSinceLastCreditFail = 0;
        const backoffMs = Math.min(
          API_CREDIT_BACKOFF_BASE_MS * Math.pow(2, apiCreditFailures - 1),
          API_CREDIT_BACKOFF_MAX_MS
        );
        apiCreditBackoffUntil = Date.now() + backoffMs;
        console.warn(
          `[worker] Anthropic API credit error (${apiCreditFailures} consecutive). ` +
          `Pausing Scout jobs for ${Math.round(backoffMs / 1000)}s. Top up credits to resume.`
        );
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      console.error("[worker] Loop error:", err);
      await sleep(2000);
    }
  }
}
