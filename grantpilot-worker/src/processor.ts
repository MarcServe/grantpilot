import { getSupabase } from "./supabase.js";
import type { CuSession, CuSessionItem } from "./types.js";
import { extractEmailFromUrl } from "./claude.js";
import { fetchProfileAndDocuments } from "./profile-data.js";
import { launchGrantBrowser, newGrantPage } from "./browser.js";
import { runGrantStep } from "./grant-steps.js";
import { getNextScoutJob, processScoutJob } from "./scout.js";

const POLL_INTERVAL_MS = 5000;
const PROGRESS_UPDATE_EVERY = 5;
const MAX_STEP_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

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

/**
 * Process all pending grant_application items with one browser session.
 * Opens grant URL once, then runs fill/upload/prepare/submit steps in order.
 */
async function processGrantApplicationSession(
  session: CuSession,
  pending: CuSessionItem[]
): Promise<number> {
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

  const applicationIdForProfile = session.public_id.startsWith("grantapp_") ? session.public_id.replace(/^grantapp_/, "") : undefined;
  const { profile, documents } = (await fetchProfileAndDocuments(profileId, applicationIdForProfile)) ?? {
    profile: {
      businessName: "",
      registrationNumber: null,
      location: "",
      sector: "",
      missionStatement: "",
      description: "",
      employeeCount: null,
      annualRevenue: null,
      previousGrants: null,
      fundingMin: 0,
      fundingMax: 0,
      fundingPurposes: [],
      fundingDetails: null,
    },
    documents: [],
  };

  const browser = await launchGrantBrowser();
  const page = await newGrantPage(browser);
  let processed = 0;

  const applicationId = session.public_id.replace(/^grantapp_/, "");

  let editedSnapshotFields: { label: string; name: string; value: string }[] | undefined;
  if (applicationId) {
    const { data: appRow } = await getSupabase()
      .from("Application")
      .select("filled_snapshot")
      .eq("id", applicationId)
      .maybeSingle();
    const snap = (appRow as { filled_snapshot?: { fields?: { label: string; name: string; value: string }[] } } | null)?.filled_snapshot;
    if (snap?.fields && snap.fields.length > 0) {
      editedSnapshotFields = snap.fields;
    }
  }

  try {
    for (const item of pending) {
      await markItemStatus(item.id, "processing");
      await appendLog(session.id, "item_processing", "update", `Item ${item.id} -> processing`);

      let lastResult: Awaited<ReturnType<typeof runGrantStep>> | null = null;
      let attempt = 0;
      const maxAttempts = MAX_STEP_RETRIES + 1;

      try {
        while (attempt < maxAttempts) {
          const isSubmit = (item.action ?? "").toLowerCase() === "submit_application";
          lastResult = await runGrantStep(page, item, profile, documents, {
            requiredAttachments: requiredAttachments.length > 0 ? requiredAttachments : undefined,
            editedSnapshotFields: isSubmit ? editedSnapshotFields : undefined,
          });
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
        const itemStatus = result.skipped ? "skipped" : result.success ? "done" : "failed";
        const extraData: Record<string, unknown> = {
          notes: result.notes,
          retries: attempt,
        };
        if (result.situation) extraData.page_situation = result.situation;
        if (result.needsDirectUrl) extraData.needs_direct_url = result.needsDirectUrl;
        await markItemStatus(item.id, itemStatus, {
          extra_data: extraData,
          processed_at: new Date().toISOString(),
        });
        await appendLog(
          session.id,
          "grant_application",
          item.action ?? "step",
          result.notes,
          result.success
        );

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
          }
        }
        processed += 1;
      } catch (err) {
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

  return processed;
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
      const pending = await getPendingItems(session.id, 25);
      if (pending.length === 0) break;

      if (session.task_type === "grant_application") {
        const n = await processGrantApplicationSession(session, pending);
        processed += n;
        if (processed % PROGRESS_UPDATE_EVERY === 0) {
          await updateSessionProgress(session.id, processed, `processed_${processed}`);
        }
        continue;
      }

      for (const item of pending) {
        try {
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

    await updateSessionProgress(session.id, processed, `final_${processed}`);
    await completeSession(session.id);
    await appendLog(session.id, "session_complete", "complete", `Completed ${session.public_id}`);
    console.log(`[worker] Session ${session.public_id} completed (${processed} items)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Session ${session.public_id} failed:`, msg);
    await failSession(session.id, msg).catch(() => {});
    await appendLog(session.id, "session_failed", "error", msg, false).catch(() => {});
  }
}

const IDLE_LOG_EVERY_POLLS = 12; // log every ~60s when no work

export async function runLoop(): Promise<void> {
  console.log("[worker] Starting poll loop... (Scout + Filer; polling every 5s)");

  let idlePolls = 0;
  while (true) {
    try {
      // Scout: find application form URLs from programme pages (nightly enqueue)
      const scoutJob = await getNextScoutJob();
      if (scoutJob) {
        idlePolls = 0;
        await processScoutJob(scoutJob);
        continue;
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
      console.error("[worker] Loop error:", err);
      await sleep(2000);
    }
  }
}
